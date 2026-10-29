import * as api from "@/lib/api";
import { setLiveOwner } from "@/lib/live";

// The file-picker return path (#338): the picker sends the app to the
// background, and by the time the file comes back Clerk's cached token can be
// past its minute. That refusal must buy one fresh token, not a sign-out.

class Xhr {
  static all: Xhr[] = [];
  status = 0;
  response = "";
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open = jest.fn();
  setRequestHeader = jest.fn();
  send = jest.fn();
  abort = jest.fn(() => this.onabort?.());
  constructor() {
    Xhr.all.push(this);
  }
  answer(status: number, body: unknown) {
    this.status = status;
    this.response = JSON.stringify(body);
    this.onload?.();
  }
}

const originalXhr = global.XMLHttpRequest;
const asset = { uri: "file://flyer.pdf", name: "flyer.pdf", mimeType: "application/pdf" };

async function settle() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

function bearerOf(xhr: Xhr): string | undefined {
  return xhr.setRequestHeader.mock.calls.find(([name]) => name === "Authorization")?.[1];
}

beforeEach(() => {
  Xhr.all = [];
  global.XMLHttpRequest = Xhr as unknown as typeof XMLHttpRequest;
  setLiveOwner("account-a");
  api.setToken(null);
});

afterEach(() => {
  global.XMLHttpRequest = originalXhr;
  setLiveOwner(null);
  api.setTokenProvider(null);
});

it("retries a 401 once with a freshly minted Clerk token and stores the file", async () => {
  const provider = jest.fn(async (options?: { force?: boolean }) =>
    options?.force ? "fresh-token" : "cached-token",
  );
  api.setTokenProvider(provider);
  const unauthorized = jest.fn();
  const stop = api.onUnauthorized(unauthorized);

  const upload = api.uploadFile(asset, "artwork");
  await settle();
  expect(bearerOf(Xhr.all[0])).toBe("Bearer cached-token");
  Xhr.all[0].answer(401, { error: "unauthorized" });
  await settle();

  expect(provider).toHaveBeenLastCalledWith({ force: true });
  expect(Xhr.all).toHaveLength(2);
  expect(bearerOf(Xhr.all[1])).toBe("Bearer fresh-token");
  Xhr.all[1].answer(201, { file: { fileId: "file_1" } });

  await expect(upload.done).resolves.toMatchObject({ fileId: "file_1" });
  expect(unauthorized).not.toHaveBeenCalled();
  stop();
});

it("reports a refusal only after the fresh token is refused too", async () => {
  api.setTokenProvider(async (options) => (options?.force ? "fresh-token" : "cached-token"));
  const unauthorized = jest.fn();
  const stop = api.onUnauthorized(unauthorized);

  const upload = api.uploadFile(asset, "artwork");
  await settle();
  Xhr.all[0].answer(401, { error: "unauthorized" });
  await settle();
  Xhr.all[1].answer(401, { error: "unauthorized" });

  await expect(upload.done).rejects.toMatchObject({ status: 401 });
  expect(unauthorized).toHaveBeenCalledTimes(1);
  stop();
});

it("does not resend when the client cancelled while the fresh token was minted", async () => {
  let mint!: (token: string) => void;
  api.setTokenProvider((options) =>
    options?.force ? new Promise((resolve) => { mint = resolve; }) : Promise.resolve("cached-token"),
  );

  const upload = api.uploadFile(asset, "artwork");
  await settle();
  Xhr.all[0].answer(401, { error: "unauthorized" });
  await settle();
  upload.cancel();
  mint("fresh-token");

  await expect(upload.done).rejects.toMatchObject({ status: 0 });
  expect(Xhr.all).toHaveLength(1);
});

it("does not retry a development token: the local API has nothing fresher to give", async () => {
  api.setToken("tok_local");
  const unauthorized = jest.fn();
  const stop = api.onUnauthorized(unauthorized);

  const upload = api.uploadFile(asset, "artwork");
  await settle();
  Xhr.all[0].answer(401, { error: "unauthorized" });

  await expect(upload.done).rejects.toMatchObject({ status: 401 });
  expect(Xhr.all).toHaveLength(1);
  expect(unauthorized).toHaveBeenCalledTimes(1);
  expect(api.getToken()).toBeNull();
  stop();
});
