import { openAlertStream } from "../alertStream";
import * as api from "@/lib/api";
jest.mock("@/lib/api", () => ({
  getApiBase: () => "http://localhost",
  getAuthToken: jest.fn(async () => "clerk-token"),
}));
class Xhr {
  static instances: Xhr[] = [];
  readyState = 0;
  status = 0;
  responseText = "";
  url = "";
  headers: Record<string, string> = {};
  onreadystatechange: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  constructor() {
    Xhr.instances.push(this);
  }
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }
  send() {}
  abort() {}
  frame(text: string, status = 200) {
    this.status = status;
    this.readyState = status === 200 ? 3 : 4;
    this.responseText += text;
    this.onreadystatechange?.();
  }
}
beforeEach(() => {
  jest.useFakeTimers();
  Xhr.instances = [];
  global.XMLHttpRequest = Xhr as unknown as typeof XMLHttpRequest;
});
afterEach(() => jest.useRealTimers());
it("delivers split SSE notification and silent events using only a bearer and fixed client role", async () => {
  const notification = jest.fn(),
    invalidate = jest.fn(),
    status = jest.fn();
  const handle = openAlertStream({
    onNotification: notification,
    onInvalidate: invalidate,
    onStatus: status,
  });
  await Promise.resolve();
  await Promise.resolve();
  const xhr = Xhr.instances[0];
  expect(xhr.url).toBe("http://localhost/notifications/stream?role=client");
  expect(xhr.headers.Authorization).toBe("Bearer clerk-token");
  xhr.frame(
    'id: n1\nevent: notification\ndata: {"notification":{"id":"n1","title":"Proof ready"}}\n',
  );
  expect(notification).not.toHaveBeenCalled();
  xhr.frame('\nevent: invalidate\ndata: {"resource":"orders","id":"o1"}\n\n');
  expect(notification).toHaveBeenCalledTimes(1);
  expect(invalidate).toHaveBeenCalledWith({ resource: "orders", id: "o1" });
  handle.close();
  xhr.frame('event: invalidate\ndata: {"resource":"orders"}\n\n');
  expect(invalidate).toHaveBeenCalledTimes(1);
});
it("forces a new identity token after 401 and clears a missing replay cursor", async () => {
  const missing = jest.fn();
  const handle = openAlertStream({
    onNotification: jest.fn(),
    getResumeFrom: () => "old",
    onResumeUnavailable: missing,
  });
  await Promise.resolve();
  await Promise.resolve();
  Xhr.instances[0].frame("", 401);
  await jest.advanceTimersByTimeAsync(3000);
  expect(api.getAuthToken).toHaveBeenLastCalledWith(true);
  Xhr.instances[1].frame("", 409);
  await jest.advanceTimersByTimeAsync(10000);
  expect(missing).toHaveBeenCalledTimes(1);
  expect(Xhr.instances.at(-1)?.headers["Last-Event-ID"]).toBeUndefined();
  handle.close();
});
