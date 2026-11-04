/* One authenticated bootstrap attempt per mounted app; never a cross-user cache. */
export function createDashboardBootstrap(load) {
  let attempt = null;
  function clear() {
    attempt?.controller.abort();
    attempt = null;
  }
  function begin(key) {
    if (attempt?.key === key) return attempt.promise;
    clear();
    const controller = new AbortController();
    const promise = Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return load(controller.signal);
    });
    // The frame can subscribe later; retain the original rejection for that reader.
    void promise.catch(() => undefined);
    attempt = { key, controller, promise };
    return promise;
  }
  function read(key) {
    if (!attempt || attempt.key !== key) return Promise.reject(new DOMException('Phiên tải dashboard đã thay đổi.', 'AbortError'));
    return attempt.promise;
  }
  return { begin, read, clear };
}

/* Read transport text with cancellation/deadline through the entire body.
   JSON is parsed inside the iframe so large object graphs stay in its own realm. */
export async function loadBootstrapState(signal, {fetcher = fetch, timeoutMs = 55_000} = {}) {
  signal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher('/api/dashboard/state', {
      cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'Không thể tải dữ liệu dashboard.');
    }
    let state;
    if (response.headers.get('x-clm-state-format') === 'gzip') {
      if (typeof DecompressionStream === 'undefined' || !response.body) throw new Error('Trình duyệt này chưa hỗ trợ giải nén dữ liệu. Vui lòng cập nhật trình duyệt.');
      state = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text();
    } else state = await response.text();
    controller.signal.throwIfAborted();
    return state;
  } catch (error) {
    if (controller.signal.aborted && !signal.aborted) throw new Error('Tải dữ liệu quá thời gian.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
