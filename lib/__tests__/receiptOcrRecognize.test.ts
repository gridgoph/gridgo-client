import {
  canRecognizeInBrowser,
  completeReceiptOcr,
  enqueueReceiptOcr,
  failReceiptOcr,
  pendingReceiptOcr,
  subscribeReceiptOcr,
  recognizeReceiptFromUri,
} from "@/lib/receiptOcrRecognize";

// What Expo Go answers when Expo's file system is asked for the document
// picker's copy of a screenshot: it reads only inside the project's folders.
const mockReadImage = jest.fn((uri: string) =>
  Promise.reject(new Error(`Location '${uri}' isn't readable.`)),
);
jest.mock("@/lib/nativeModules", () => ({
  getFileSystemLegacyNative: () => ({ readAsStringAsync: mockReadImage }),
}));

type LocalFile = { type: string; base64: string };
type FakeBlob = LocalFile & { size: number };

/**
 * React Native's networking and FileReader, as the recognizer uses them for a
 * picked file. `hold` keeps a read pending until the test releases it.
 */
function installLocalFiles(files: Record<string, LocalFile>) {
  const held = new Map<string, () => void>();
  class FakeXhr {
    responseType = "";
    response: FakeBlob | null = null;
    status = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private url = "";
    open(_method: string, url: string) {
      this.url = url;
    }
    send() {
      const answer = () => {
        const file = files[this.url];
        if (!file) {
          this.onerror?.();
          return;
        }
        this.status = 200;
        this.response = this.responseType === "blob" ? { ...file, size: file.base64.length } : null;
        this.onload?.();
      };
      if (held.has(this.url)) held.set(this.url, answer);
      else setTimeout(answer, 0);
    }
  }
  class FakeFileReader {
    result: string | null = null;
    onloadend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL(blob: FakeBlob) {
      setTimeout(() => {
        this.result = `data:${blob.type || "application/octet-stream"};base64,${blob.base64}`;
        this.onloadend?.();
      }, 0);
    }
  }
  const saved = { xhr: global.XMLHttpRequest, reader: global.FileReader };
  global.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
  global.FileReader = FakeFileReader as unknown as typeof FileReader;
  return {
    hold: (url: string) => held.set(url, () => {}),
    release: (url: string) => held.get(url)?.(),
    restore: () => {
      global.XMLHttpRequest = saved.xhr;
      global.FileReader = saved.reader;
    },
  };
}

async function nextPending() {
  for (let i = 0; i < 20 && !pendingReceiptOcr(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return pendingReceiptOcr();
}

it("does not take the in-page Tesseract path under Jest (native host)", () => {
  expect(canRecognizeInBrowser()).toBe(false);
});

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
  const files = installLocalFiles({ "file://old.png": { type: "image/png", base64: "b2xk" } });
  try {
    files.hold("file://old.png");
    let current = true;
    const old = recognizeReceiptFromUri("file://old.png", () => current).catch((error: Error) => error.message);
    current = false;
    const newest = recognizeReceiptFromUri("data:image/png;base64,new", () => true);
    await Promise.resolve();
    const pending = pendingReceiptOcr()!;
    expect(pending.dataUrl).toBe("data:image/png;base64,new");
    files.release("file://old.png");
    expect(await old).toBe("replaced");
    expect(pendingReceiptOcr()).toBe(pending);
    completeReceiptOcr(pending.id, { text: "965373469", confidence: 90 });
    await expect(newest).resolves.toEqual({ text: "965373469", confidence: 90 });
  } finally {
    files.restore();
  }
});

describe("a screenshot picked on the phone (#180)", () => {
  // Expo Go's document picker copies the screenshot here, outside the folders
  // Expo's file system will read for a project.
  const PICKED = "file:///data/user/0/host.exp.exponent/cache/DocumentPicker/0e8d28f2.png";

  it("reaches the reader even though Expo Go's file system refuses the picker's copy", async () => {
    const files = installLocalFiles({ [PICKED]: { type: "image/png", base64: "cmVjZWlwdA==" } });
    try {
      const reading = recognizeReceiptFromUri(PICKED);
      reading.catch(() => {}); // asserted below, once the reader has the image
      const pending = await nextPending();
      expect(pending?.dataUrl).toBe("data:image/png;base64,cmVjZWlwdA==");
      completeReceiptOcr(pending!.id, { text: "Ref No. 9044 838 604781", confidence: 88 });
      await expect(reading).resolves.toEqual({ text: "Ref No. 9044 838 604781", confidence: 88 });
    } finally {
      files.restore();
    }
  });

  it("gives the reader an image type when the phone did not name one", async () => {
    const jpeg = "file:///data/user/0/host.exp.exponent/cache/DocumentPicker/receipt.jpg";
    const files = installLocalFiles({ [jpeg]: { type: "", base64: "anBlZw==" } });
    try {
      const reading = recognizeReceiptFromUri(jpeg);
      reading.catch(() => {}); // asserted below, once the reader has the image
      const pending = await nextPending();
      expect(pending?.dataUrl).toBe("data:image/jpeg;base64,anBlZw==");
      completeReceiptOcr(pending!.id, { text: "", confidence: 0 });
      await reading;
    } finally {
      files.restore();
    }
  });

  it("says the screenshot could not be read when the file is gone", async () => {
    const files = installLocalFiles({});
    try {
      await expect(recognizeReceiptFromUri(PICKED)).rejects.toThrow("That screenshot could not be read.");
      expect(pendingReceiptOcr()).toBeNull();
    } finally {
      files.restore();
    }
  });
});
