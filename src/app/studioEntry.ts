const LAST_STUDIO_PATH = 'synesthesia:last-studio-path';

export function readRememberedStudioPath(): string | null {
  try {
    const stored = window.sessionStorage.getItem(LAST_STUDIO_PATH);
    return stored?.startsWith('/studio/') ? stored : null;
  } catch {
    return null;
  }
}

export function rememberStudioPath(path: string): void {
  if (!path.startsWith('/studio/')) return;
  try {
    window.sessionStorage.setItem(LAST_STUDIO_PATH, path);
  } catch {
    // The Studio landing still works without a remembered destination.
  }
}

export function forgetStudioPath(): void {
  try {
    window.sessionStorage.removeItem(LAST_STUDIO_PATH);
  } catch {
    // Nothing else depends on this convenience.
  }
}
