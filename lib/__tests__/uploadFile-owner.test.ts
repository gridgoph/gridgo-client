import * as api from "@/lib/api";
import { setLiveOwner } from "@/lib/live";

class Xhr {
  static latest: Xhr;
  status = 0;
  response = "";
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  open = jest.fn();
  setRequestHeader = jest.fn();
  send = jest.fn();
  abort = jest.fn();
  constructor() { Xhr.latest = this; }
}
const originalXhr = global.XMLHttpRequest;
const asset = { uri: "file://receipt.png", name: "receipt.png", mimeType: "image/png" };
beforeEach(() => {
  global.XMLHttpRequest = Xhr as unknown as typeof XMLHttpRequest;
  setLiveOwner("account-a");
  api.setToken("tok_a");
  api.setTokenProvider(null);
});
afterEach(() => {
  global.XMLHttpRequest = originalXhr;
  setLiveOwner(null);
  api.setToken(null);
  api.setTokenProvider(null);
});

it.each([401, 201])("rejects an old upload response without touching the new account: %s", async (status) => {
  const unauthorized = jest.fn();
  const stop = api.onUnauthorized(unauthorized);
  const progress = jest.fn();
  const upload = api.uploadFile(asset, "payment_proof", progress);
  await Promise.resolve();
  await Promise.resolve();
  expect(Xhr.latest.send).toHaveBeenCalledTimes(1);
  setLiveOwner("account-b");
  api.setToken("tok_b");
  Xhr.latest.status = status;
  Xhr.latest.response = JSON.stringify({ file: { fileId: "old-file" } });
  Xhr.latest.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 1 } as ProgressEvent);
  Xhr.latest.onload?.();
  await expect(upload.done).rejects.toThrow("account changed");
  expect(unauthorized).not.toHaveBeenCalled();
  expect(api.getToken()).toBe("tok_b");
  expect(progress).not.toHaveBeenCalled();
  stop();
});

it("does not start a transfer if the owner changes while a token resolves", async () => {
  let finish!: (token: string) => void;
  api.setToken(null);
  api.setTokenProvider(() => new Promise((resolve) => { finish = resolve; }));
  const upload = api.uploadFile(asset, "payment_proof");
  setLiveOwner("account-b");
  finish("account-a-token");
  await expect(upload.done).rejects.toThrow("account changed");
  expect(Xhr.latest.send).not.toHaveBeenCalled();
});
