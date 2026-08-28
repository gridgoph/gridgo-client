import {
  CHAT_LIST_ROUTE,
  CHAT_NOT_LIVE,
  CHAT_THREAD_ROUTE,
  CHAT_THREADS,
  chatThread,
} from "@/lib/chatThreads";

describe("chat threads", () => {
  it("carries exactly the three counterparties a client has", () => {
    expect(CHAT_THREADS.map((t) => t.peer)).toEqual(["supplier", "rider", "gridbot"]);
  });

  it("says when each conversation starts, so three empty rows are not identical", () => {
    const whens = CHAT_THREADS.map((t) => t.opensWhen);
    expect(new Set(whens).size).toBe(CHAT_THREADS.length);
    for (const thread of CHAT_THREADS) {
      expect(thread.opensWhen.trim()).not.toBe("");
      expect(thread.willCarry.trim()).not.toBe("");
    }
  });

  it("never implies a message could arrive today", () => {
    expect(CHAT_NOT_LIVE).toMatch(/not carrying messages yet/);
  });

  it("resolves a peer, and refuses one it does not have", () => {
    expect(chatThread("gridbot")?.name).toBe("Gridbot");
    expect(chatThread("ops")).toBeNull();
    expect(chatThread(undefined)).toBeNull();
  });

  it("routes under the list, and names the dynamic route rather than a path", () => {
    expect(CHAT_LIST_ROUTE).toBe("/chat");
    expect(CHAT_THREAD_ROUTE).toBe("/chat/[thread]");
  });
});
