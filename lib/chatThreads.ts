/**
 * Who a client can message: Operations. Supplier, rider and Gridbot were
 * placeholders for a backend that never existed; the live desk is ops/admin.
 */

export type ChatPeer = "ops";

export type ChatThread = {
  peer: ChatPeer;
  name: string;
  role: string;
};

export const CHAT_PEER: ChatPeer = "ops";

export const CHAT_THREADS: readonly ChatThread[] = [
  {
    peer: "ops",
    name: "Operations",
    role: "GRIDGO operations",
  },
] as const;

export function chatThread(peer: string | undefined): ChatThread | null {
  return CHAT_THREADS.find((thread) => thread.peer === peer) ?? null;
}

export const CHAT_LIST_ROUTE = "/chat";
export const CHAT_THREAD_ROUTE = "/chat/[thread]";
export const CHAT_OPS_PARAMS = { thread: CHAT_PEER } as const;
