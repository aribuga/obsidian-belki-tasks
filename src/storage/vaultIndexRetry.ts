export const VAULT_INDEX_RETRY_DELAYS_MS = [50, 100, 200, 400] as const;

export type IndexedPathLookupResult<T> =
  | { status: "ready"; item: T }
  | { status: "missing" }
  | { status: "wrong-type" };

interface EnsureIndexedPathOptions<T> {
  path: string;
  expectedKind: "file" | "folder";
  lookup: () => IndexedPathLookupResult<T>;
  create: () => Promise<T>;
  isAlreadyExistsError: (error: unknown) => boolean;
  retryDelaysMs?: readonly number[];
  wait?: (ms: number) => Promise<void>;
  onRetryExhausted?: (error: unknown) => void;
}

export async function ensureIndexedPath<T>(
  options: EnsureIndexedPathOptions<T>
): Promise<T | null> {
  const existing = options.lookup();
  if (existing.status === "ready") {
    return existing.item;
  }
  if (existing.status === "wrong-type") {
    return null;
  }

  let alreadyExistsError: unknown;

  try {
    return await options.create();
  } catch (error) {
    if (!options.isAlreadyExistsError(error)) {
      throw error;
    }
    alreadyExistsError = error;

    const created = options.lookup();
    if (created.status === "ready") {
      return created.item;
    }
    if (created.status === "wrong-type") {
      return null;
    }
  }

  const wait = options.wait || defaultWait;
  const retryDelaysMs = options.retryDelaysMs || VAULT_INDEX_RETRY_DELAYS_MS;

  for (const delayMs of retryDelaysMs) {
    await wait(delayMs);
    const indexed = options.lookup();
    if (indexed.status === "ready") {
      return indexed.item;
    }
    if (indexed.status === "wrong-type") {
      return null;
    }
  }

  options.onRetryExhausted?.(alreadyExistsError);
  return null;
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
