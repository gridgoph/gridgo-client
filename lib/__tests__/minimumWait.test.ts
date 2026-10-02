import { REMATCH_MINIMUM_MS, withMinimumWait } from "@/lib/minimumWait";

describe("withMinimumWait", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("is three seconds after a priority change", () => {
    expect(REMATCH_MINIMUM_MS).toBe(3000);
  });

  it("holds a fast answer until the minimum has passed", async () => {
    const settled = jest.fn();
    void withMinimumWait(Promise.resolve("match"), 3000).then(settled);

    await jest.advanceTimersByTimeAsync(2999);
    expect(settled).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledWith("match");
  });

  it("is a floor, not a delay added to a slow answer", async () => {
    let answer: (value: string) => void = () => undefined;
    const slow = new Promise<string>((resolve) => {
      answer = resolve;
    });
    const settled = jest.fn();
    void withMinimumWait(slow, 3000).then(settled);

    await jest.advanceTimersByTimeAsync(5000);
    expect(settled).not.toHaveBeenCalled();

    answer("late match");
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledWith("late match");
  });

  it("holds a failure for the same minimum before it surfaces", async () => {
    const failed = jest.fn();
    void withMinimumWait(Promise.reject(new Error("offline")), 3000).catch(failed);

    await jest.advanceTimersByTimeAsync(2999);
    expect(failed).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(failed).toHaveBeenCalledWith(new Error("offline"));
  });
});
