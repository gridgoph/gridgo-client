import { getOrder, setToken, setTokenProvider } from "@/lib/api";
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
