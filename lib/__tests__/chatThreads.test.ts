import {
  CHAT_LIST_ROUTE,
  CHAT_OPS_PARAMS,
  CHAT_PEER,
  CHAT_THREAD_ROUTE,
  CHAT_THREADS,
  chatThread,
} from "@/lib/chatThreads";

describe("chat threads", () => {
  it("carries Operations as the only counterparty", () => {
    expect(CHAT_THREADS.map((t) => t.peer)).toEqual(["ops"]);
    expect(CHAT_PEER).toBe("ops");
    expect(CHAT_THREADS[0]?.name).toBe("Operations");
  });

  it("resolves Operations and refuses the retired placeholders", () => {
    expect(chatThread("ops")?.name).toBe("Operations");
    expect(chatThread("supplier")).toBeNull();
    expect(chatThread("rider")).toBeNull();
    expect(chatThread("gridbot")).toBeNull();
    expect(chatThread(undefined)).toBeNull();
  });

  it("routes under the list, and names the dynamic route rather than a path", () => {
    expect(CHAT_LIST_ROUTE).toBe("/chat");
    expect(CHAT_THREAD_ROUTE).toBe("/chat/[thread]");
    expect(CHAT_OPS_PARAMS).toEqual({ thread: "ops" });
  });
});
