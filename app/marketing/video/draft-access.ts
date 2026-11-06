export function createPhaseFiveDraftCache() {
  const drafts = new Map<string, unknown>();
  let currentScope = "";
  let revision = 0;

  function clear() {
    drafts.clear();
    revision++;
  }

  return {
    observe(scope: string) {
      if (currentScope !== scope) {
        currentScope = scope;
        clear();
      }
      return revision;
    },
    clear,
    isCurrent(version: number) {
      return revision === version;
    },
    read<T>(key: string) {
      return (drafts.get(key) as T | undefined) ?? null;
    },
    write<T>(key: string, value: T | null) {
      if (value === null) drafts.delete(key);
      else drafts.set(key, value);
    },
  };
}

export const phaseFiveDraftCache = createPhaseFiveDraftCache();
