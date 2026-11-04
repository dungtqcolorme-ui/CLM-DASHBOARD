export function createDashboardBootstrap<T>(load: (signal: AbortSignal) => Promise<T>): {
  begin(key: string): Promise<T>;
  read(key: string): Promise<T>;
  clear(): void;
};
export function loadBootstrapState(signal: AbortSignal, options?: {
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<string>;
