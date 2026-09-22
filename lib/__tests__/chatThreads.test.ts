import {
  CHAT_LIST_ROUTE,
  CHAT_OPS_PARAMS,
  CHAT_PEER,
  CHAT_THREADS,
  CHAT_THREAD_ROUTE,
  chatThread,
  chatThreadRoute,
  isChatThreadId,
} from "@/lib/chatThreads";

describe("chat threads", () => {
  it("carries Operations as the only counterparty", () => {
    expect(CHAT_THREADS.map((t) => t.peer)).toEqual(["ops"]);
    expect(CHAT_PEER).toBe("ops");
    expect(CHAT_THREADS[0]?.name).toBe("Operations");
  });

  it("resolves Operations, a live thread id, and refuses the retired placeholders", () => {
    expect(chatThread("ops")?.name).toBe("Operations");
    expect(chatThread("2c1b0a9e-8d7c-4b3a-9f10-1234567890ab")?.id).toBe(
      "2c1b0a9e-8d7c-4b3a-9f10-1234567890ab",
    );
    expect(isChatThreadId("2c1b0a9e-8d7c-4b3a-9f10-1234567890ab")).toBe(true);
    expect(chatThread("supplier")).toBeNull();
    expect(chatThread("rider")).toBeNull();
    expect(chatThread("gridbot")).toBeNull();
    expect(chatThread(undefined)).toBeNull();
  });

  it("routes under the list, and names the dynamic route rather than a path", () => {
    expect(CHAT_LIST_ROUTE).toBe("/chat");
    expect(CHAT_THREAD_ROUTE).toBe("/chat/[thread]");
    expect(CHAT_OPS_PARAMS).toEqual({ thread: "ops" });
    expect(chatThreadRoute("2c1b0a9e-8d7c-4b3a-9f10-1234567890ab")).toEqual({
      pathname: "/chat/[thread]",
      params: { thread: "2c1b0a9e-8d7c-4b3a-9f10-1234567890ab" },
    });
  });
});
