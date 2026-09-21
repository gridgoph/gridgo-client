/**
 * Who a client can message: Operations. History is many conversations with
 * that one desk — never the unused supplier, rider or Gridbot placeholders.
 */

export type ChatPeer = "ops";

export type ChatThread = {
  peer: ChatPeer;
  name: string;
  role: string;
  id?: string;
};

export const CHAT_PEER: ChatPeer = "ops";

export const CHAT_THREADS: readonly ChatThread[] = [
  {
    peer: "ops",
    name: "Operations",
    role: "GRIDGO operations",
  },
] as const;

const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isChatThreadId(value: string | undefined): value is string {
  return Boolean(value && THREAD_ID.test(value));
}

export function chatThread(peer: string | undefined): ChatThread | null {
  if (isChatThreadId(peer)) {
    return { ...CHAT_THREADS[0], id: peer };
  }
  return CHAT_THREADS.find((thread) => thread.peer === peer) ?? null;
}

export const CHAT_LIST_ROUTE = "/chat";
export const CHAT_THREAD_ROUTE = "/chat/[thread]";
export const CHAT_OPS_PARAMS = { thread: CHAT_PEER } as const;

export function chatThreadRoute(threadId: string): { pathname: "/chat/[thread]"; params: { thread: string } } {
  return { pathname: "/chat/[thread]", params: { thread: threadId } };
}
