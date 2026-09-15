import {
  completeReceiptOcr,
  enqueueReceiptOcr,
  failReceiptOcr,
  pendingReceiptOcr,
  subscribeReceiptOcr,
  recognizeReceiptFromUri,
} from "@/lib/receiptOcrRecognize";

const mockReadImage = jest.fn();
jest.mock("@/lib/nativeModules", () => ({
  getFileSystemLegacyNative: () => ({ readAsStringAsync: mockReadImage }),
}));

describe("receipt OCR jobs", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("publishes a stable snapshot and accepts only the current receipt's result", async () => {
    const changed = jest.fn();
    const unsubscribe = subscribeReceiptOcr(changed);
    const first = enqueueReceiptOcr("data:image/png;base64,first");
    const firstOutcome = first.catch((error: Error) => error.message);
    const old = pendingReceiptOcr()!;
    expect(pendingReceiptOcr()).toBe(old);
    const second = enqueueReceiptOcr(old.dataUrl);
    const current = pendingReceiptOcr()!;
    expect(current.id).not.toBe(old.id);
    expect(await firstOutcome).toBe("replaced");
    completeReceiptOcr(old.id, { text: "wrong receipt", confidence: 99 });
    failReceiptOcr(old.id, "old worker error");
    expect(pendingReceiptOcr()).toBe(current);
    completeReceiptOcr(current.id, { text: "Ref No. 9044838604781", confidence: 90 });
    await expect(second).resolves.toEqual({ text: "Ref No. 9044838604781", confidence: 90 });
    expect(pendingReceiptOcr()).toBeNull();
    expect(changed).toHaveBeenCalled();
    unsubscribe();
  });

  it("clears a timed out job so another upload can start", async () => {
    jest.useFakeTimers();
    const pending = enqueueReceiptOcr("data:image/png;base64,slow");
    const outcome = pending.catch((error: Error) => error.message);
    jest.advanceTimersByTime(45_000);
    expect(await outcome).toBe("The screenshot took too long to read.");
    expect(pendingReceiptOcr()).toBeNull();
    const next = enqueueReceiptOcr("data:image/png;base64,next");
    completeReceiptOcr(pendingReceiptOcr()!.id, { text: "GCash Reference No. 965373469", confidence: 90 });
    await expect(next).resolves.toHaveProperty("confidence", 90);
  });
});

it("does not replace current recognition when an old image conversion finishes", async () => {
  let finish!: (base64: string) => void;
  let current = true;
  mockReadImage.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const old = recognizeReceiptFromUri("file://old.png", () => current).catch((error: Error) => error.message);
  current = false;
  const newest = recognizeReceiptFromUri("data:image/png;base64,new", () => true);
  await Promise.resolve();
  const pending = pendingReceiptOcr()!;
  expect(pending.dataUrl).toBe("data:image/png;base64,new");
  finish("old");
  expect(await old).toBe("replaced");
  expect(pendingReceiptOcr()).toBe(pending);
  completeReceiptOcr(pending.id, { text: "965373469", confidence: 90 });
  await expect(newest).resolves.toEqual({ text: "965373469", confidence: 90 });
});
