export function createCalendarThumbnailQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
      const result = tail.then(() => {
        if (signal.aborted) throw new DOMException("Thumbnail request cancelled", "AbortError");
        return work();
      });
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
export type CalendarThumbnailQueue = ReturnType<typeof createCalendarThumbnailQueue>;
