export async function openExternalUrl(url: string): Promise<void> {
  const electronRequire = (window as typeof window & { require?: (id: string) => unknown }).require;
  const electron = electronRequire?.("electron") as { shell?: { openExternal?: (target: string) => Promise<void> } } | undefined;
  if (electron?.shell?.openExternal) {
    await electron.shell.openExternal(url);
    return;
  }

  window.open(url, "_blank", "noopener");
}
