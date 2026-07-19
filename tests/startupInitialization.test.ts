import { test } from "node:test";
import * as assert from "node:assert/strict";
import { InitializationGate } from "../src/startup/initializationGate";
import { ensureIndexedPath } from "../src/storage/vaultIndexRetry";

test("existing folder waits until the vault index exposes the folder", async () => {
  const folder = { path: "_belki_files/Data" };
  const delays: number[] = [];
  let waitCount = 0;
  let createCalls = 0;

  const result = await ensureIndexedPath({
    path: folder.path,
    expectedKind: "folder",
    lookup: () => (waitCount >= 2 ? { status: "ready", item: folder } : { status: "missing" }),
    create: async () => {
      createCalls += 1;
      throw new Error("Folder already exists.");
    },
    isAlreadyExistsError,
    retryDelaysMs: [5, 10, 20],
    wait: async (ms) => {
      delays.push(ms);
      waitCount += 1;
    }
  });

  assert.equal(result, folder);
  assert.equal(createCalls, 1);
  assert.deepEqual(delays, [5, 10]);
});

test("existing file waits until the vault index exposes the file", async () => {
  const file = { path: "_belki_files/main.md" };
  const delays: number[] = [];
  let indexed = false;

  const result = await ensureIndexedPath({
    path: file.path,
    expectedKind: "file",
    lookup: () => (indexed ? { status: "ready", item: file } : { status: "missing" }),
    create: async () => {
      throw new Error("File already exists.");
    },
    isAlreadyExistsError,
    retryDelaysMs: [5],
    wait: async (ms) => {
      delays.push(ms);
      indexed = true;
    }
  });

  assert.equal(result, file);
  assert.deepEqual(delays, [5]);
});

test("existing storage path is not treated as ready before the expected indexed type exists", async () => {
  const folder = { path: "_belki_files/Nested/Data" };
  const lookupStates: string[] = [];
  let waitCount = 0;

  const result = await ensureIndexedPath({
    path: folder.path,
    expectedKind: "folder",
    lookup: () => {
      const status = waitCount >= 1 ? "ready" : "missing";
      lookupStates.push(status);
      return status === "ready" ? { status, item: folder } : { status };
    },
    create: async () => {
      throw new Error("EEXIST: folder already exists");
    },
    isAlreadyExistsError,
    retryDelaysMs: [5],
    wait: async () => {
      waitCount += 1;
    }
  });

  assert.equal(result, folder);
  assert.deepEqual(lookupStates, ["missing", "missing", "ready"]);
});

test("retry exhaustion returns a controlled missing result", async () => {
  const delays: number[] = [];
  let exhaustedError: unknown;

  const result = await ensureIndexedPath({
    path: "_belki_files/Data",
    expectedKind: "folder",
    lookup: () => ({ status: "missing" }),
    create: async () => {
      throw new Error("already exists");
    },
    isAlreadyExistsError,
    retryDelaysMs: [5, 10],
    wait: async (ms) => {
      delays.push(ms);
    },
    onRetryExhausted: (error) => {
      exhaustedError = error;
    }
  });

  assert.equal(result, null);
  assert.ok(exhaustedError);
  assert.match(String(exhaustedError), /already exists/);
  assert.deepEqual(delays, [5, 10]);
});

test("unexpected storage creation errors are still thrown without retrying", async () => {
  let waitCalls = 0;

  await assert.rejects(
    ensureIndexedPath({
      path: "_belki_files/Data",
      expectedKind: "folder",
      lookup: () => ({ status: "missing" }),
      create: async () => {
        throw new Error("permission denied");
      },
      isAlreadyExistsError,
      retryDelaysMs: [5],
      wait: async () => {
        waitCalls += 1;
      }
    }),
    /permission denied/
  );

  assert.equal(waitCalls, 0);
});

test("wrong indexed item type fails without creating or retrying", async () => {
  let createCalls = 0;
  let waitCalls = 0;

  const result = await ensureIndexedPath({
    path: "_belki_files/Data",
    expectedKind: "folder",
    lookup: () => ({ status: "wrong-type" }),
    create: async () => {
      createCalls += 1;
      return { path: "_belki_files/Data" };
    },
    isAlreadyExistsError,
    wait: async () => {
      waitCalls += 1;
    }
  });

  assert.equal(result, null);
  assert.equal(createCalls, 0);
  assert.equal(waitCalls, 0);
});

test("store initialization gate reuses concurrent initialization and allows retry after failure", async () => {
  const gate = new InitializationGate();
  let loadCalls = 0;
  let releaseLoad: () => void = () => {
    throw new Error("load resolver was not assigned");
  };

  const first = gate.run(
    () =>
      new Promise<void>((resolve) => {
        loadCalls += 1;
        releaseLoad = resolve;
      })
  );
  const second = gate.run(async () => {
    loadCalls += 1;
  });

  assert.equal(first, second);
  assert.equal(loadCalls, 1);
  assert.equal(gate.isRunning(), true);

  releaseLoad();
  await first;

  assert.equal(gate.isRunning(), false);

  await assert.rejects(
    gate.run(async () => {
      loadCalls += 1;
      throw new Error("load failed");
    }),
    /load failed/
  );

  assert.equal(gate.isRunning(), false);

  await gate.run(async () => {
    loadCalls += 1;
  });

  assert.equal(loadCalls, 3);
});

function isAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists|EEXIST/i.test(message);
}
