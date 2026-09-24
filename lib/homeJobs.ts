/**
 * How Home sorts a client's jobs into the three questions it answers.
 *
 * Needs you: the job is waiting on the client, so it leads, and every one of
 * them is shown — hiding a job that is waiting on someone is how it stays
 * waiting. In progress: GRIDGO, a shop or a rider has it, and the client wants
 * to know where it has got to. Finished: nothing more will happen, so it is a
 * quiet line the client can reopen, never a card competing with live work.
 *
 * Order within each group is the API's own, the same order Orders shows.
 */

import type { Order } from "@/lib/api";
import { orderNeedsClient } from "@/lib/orderState";

/** Cards and rows Home draws per group. Orders is one tap away for the rest. */
export const HOME_IN_PROGRESS_LIMIT = 3;
export const HOME_FINISHED_LIMIT = 3;

/**
 * States after which nothing more happens to the job from the client's side.
 * `delivered` counts: the issue window it opens is its own state
 * (`issue_window_open`), which asks for the client and so is never here.
 */
const FINISHED_STATES = new Set(["delivered", "completed", "payout_released"]);

export function isFinishedOrderState(state: string): boolean {
  return FINISHED_STATES.has(state);
}

export type HomeJobs = {
  needsYou: Order[];
  inProgress: Order[];
  /** Every job in progress, including the ones past the limit. */
  inProgressTotal: number;
  finished: Order[];
};

export function homeJobs(orders: Order[]): HomeJobs {
  const needsYou: Order[] = [];
  const active: Order[] = [];
  const done: Order[] = [];

  for (const order of orders) {
    if (orderNeedsClient(order)) needsYou.push(order);
    else if (isFinishedOrderState(order.state)) done.push(order);
    // A state this app does not know is treated as live: calling an unknown
    // job finished would tell the client to stop watching it.
    else active.push(order);
  }

  return {
    needsYou,
    inProgress: active.slice(0, HOME_IN_PROGRESS_LIMIT),
    inProgressTotal: active.length,
    finished: done.slice(0, HOME_FINISHED_LIMIT),
  };
}
