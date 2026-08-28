/**
 * Who a client can message, and — the part that matters while there is no
 * message backend — *when* each conversation starts carrying anything.
 *
 * GRIDGO is not carrying messages yet. That is a fact, not a loading state, so
 * this module holds the honest version of it rather than letting three screens
 * each invent their own. The rule from the rest of the app applies here
 * unchanged: never render an empty surface as if it were merely quiet. A
 * client who reads "no messages yet" waits for one; a client who reads
 * "messaging is not switched on yet" does not.
 *
 * The second line on every row is the real content of this screen. Supplier,
 * Rider and Gridbot are not three identical dead threads — they open at three
 * different points of a job, and saying so turns a placeholder into a small
 * map of who the client will end up talking to.
 *
 * When a backend lands, `opensWhen` stays (it is still true) and the empty
 * copy below is what gets replaced by messages.
 */

export type ChatPeer = "supplier" | "rider" | "gridbot";

export type ChatThread = {
  peer: ChatPeer;
  /** What the client calls this counterparty. */
  name: string;
  /** Who they are to the job, in one line. */
  role: string;
  /** The point in a job at which this conversation starts. */
  opensWhen: string;
  /** What will arrive here, said in the thread's own empty state. */
  willCarry: string;
};

export const CHAT_THREADS: readonly ChatThread[] = [
  {
    peer: "supplier",
    name: "Supplier",
    role: "The shop printing your job",
    opensWhen: "Opens once a shop takes your job",
    willCarry:
      "Questions from the shop printing your job — a proof detail, a material swap, anything that needs your call.",
  },
  {
    peer: "rider",
    name: "Rider",
    role: "Whoever is carrying your delivery",
    opensWhen: "Opens once your job is out for delivery",
    willCarry:
      "Notes from the rider carrying your delivery — gate access, a landmark, where to hand it over.",
  },
  {
    peer: "gridbot",
    name: "Gridbot",
    role: "GRIDGO's help desk",
    opensWhen: "Opens once GRIDGO's help desk goes live",
    willCarry:
      "Answers about a job — where it has got to, what a state means, what happens next.",
  },
] as const;

/** The one sentence that keeps this screen honest. Say it, do not imply it. */
export const CHAT_NOT_LIVE =
  "GRIDGO is not carrying messages yet, so nothing will arrive here today.";

/** Where order news actually reaches a client in the meantime. */
export const CHAT_MEANWHILE = "Until then, every update on a job arrives in Notifications.";

export function chatThread(peer: string | undefined): ChatThread | null {
  return CHAT_THREADS.find((thread) => thread.peer === peer) ?? null;
}

export const CHAT_LIST_ROUTE = "/chat";

/**
 * The dynamic route, not an interpolated path. Expo Router types hrefs, and
 * the `{ pathname, params }` form is the one that keeps a peer checked against
 * `ChatPeer` all the way to the screen instead of becoming a bare string.
 */
export const CHAT_THREAD_ROUTE = "/chat/[thread]";
