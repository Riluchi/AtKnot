const AUTOSAVE_KEY = 'atknot/autosave/v1';

export function loadAutosave(): string | null {
  return window.localStorage.getItem(AUTOSAVE_KEY);
}

export function saveAutosave(serialized: string): void {
  window.localStorage.setItem(AUTOSAVE_KEY, serialized);
}

export function clearAutosave(): void {
  window.localStorage.removeItem(AUTOSAVE_KEY);
}

export { AUTOSAVE_KEY };
