import { withRequestDeadline } from "@/lib/requestDeadline";
import { getOrder, listNotifications, NOTIFICATIONS_TIMEOUT_MS, setToken, setTokenProvider } from "@/lib/api";
afterEach(() => { jest.useRealTimers(); setTokenProvider(null); });
it("bounds a stalled response body so focused live refresh can recover", async () => {
  jest.useFakeTimers(); setToken(null); setTokenProvider(async () => "bearer");
  global.fetch = jest.fn(async () => ({ ok: true, text: () => new Promise(() => {}) } as Response)) as typeof fetch;
  const rejected = expect(getOrder("order")).rejects.toMatchObject({ name: "TimeoutError" });
  await jest.advanceTimersByTimeAsync(20_000);
  await rejected;
});
it("does not send a late token after its request deadline", async () => {
  jest.useFakeTimers(); setToken(null);
  let release!: (token: string) => void;
  setTokenProvider(() => new Promise((resolve) => { release = resolve; }));
  global.fetch = jest.fn();
  const rejected = expect(getOrder("order")).rejects.toMatchObject({ name: "TimeoutError" });
  await jest.advanceTimersByTimeAsync(20_000); await rejected;
  release("late"); await Promise.resolve(); await Promise.resolve();
  expect(global.fetch).not.toHaveBeenCalled();
});


it("keeps caller cancellation as AbortError while the response body is stalled", async () => {
  const caller = new AbortController();
  const rejected = expect(withRequestDeadline(caller.signal, () => new Promise(() => {})))
    .rejects.toMatchObject({ name: "AbortError" });
  caller.abort();
  await rejected;
});

it("keeps an already cancelled caller as AbortError", async () => {
  const caller = new AbortController();
  caller.abort();
  await expect(withRequestDeadline(caller.signal, async () => "ignored"))
    .rejects.toMatchObject({ name: "AbortError" });
});

it("does not send a late token after the inbox caller cancels", async () => {
  jest.useFakeTimers(); setToken(null);
  let release!: (token: string) => void;
  setTokenProvider(() => new Promise((resolve) => { release = resolve; }));
  global.fetch = jest.fn();
  const rejected = expect(listNotifications()).rejects.toMatchObject({ name: "AbortError" });
  await jest.advanceTimersByTimeAsync(NOTIFICATIONS_TIMEOUT_MS);
  await rejected;
  release("late"); await Promise.resolve(); await Promise.resolve();
  expect(global.fetch).not.toHaveBeenCalled();
});
