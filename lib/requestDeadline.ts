/** One deadline covers token resolution, fetch, and response body consumption. */
export async function withRequestDeadline<T>(caller: AbortSignal | null | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = new Error("The request timed out. Try again.");
  timeout.name = "TimeoutError";
  const cancel = () => controller.abort();
  let rejectAbort!: () => void;
  let timedOut = false;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(timedOut ? timeout : new Error("Request cancelled"));
    controller.signal.addEventListener("abort", rejectAbort);
  });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
  if (caller?.aborted) cancel(); else caller?.addEventListener("abort", cancel);
  try { return await Promise.race([aborted, run(controller.signal)]); }
  finally {
    clearTimeout(timer);
    caller?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}
