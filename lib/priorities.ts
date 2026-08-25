/**
 * What the client wants GRIDGO to optimise for.
 *
 * Three things pull against each other on every print job: how good it comes
 * out, how fast it is ready, and how far it has to travel. A client cannot have
 * all three first, so GRIDGO asks them to put the three in order once and then
 * matches on that order for the life of the account.
 *
 * It is an order, not a set of weights. Weights would need a number nobody can
 * give honestly ("quality 0.6"), and would make two shops tie in ways that are
 * impossible to explain. A strict order always produces one winner and always
 * produces a sentence: this shop won on speed, and speed is what you asked for
 * first. That sentence is the whole point — see `lib/shopMatch.ts`.
 *
 * The ranking lives on the phone (`store/priorities.ts`). GRIDGO has no route
 * for a client preference yet, so it does not follow the account to a second
 * device; when one lands, this module is what it reads and writes.
 */

export type Priority = "quality" | "speed" | "distance";

/** Ordered best-first. Always all three, never a partial list. */
export type PriorityRanking = readonly [Priority, Priority, Priority];

export const PRIORITIES: readonly Priority[] = ["quality", "speed", "distance"] as const;

export function priorityLabel(priority: Priority): string {
  switch (priority) {
    case "quality":
      return "Quality";
    case "speed":
      return "Speed";
    case "distance":
      return "Distance";
  }
}

/** What ranking this first actually costs the client, said plainly. */
export function priorityBlurb(priority: Priority): string {
  switch (priority) {
    case "quality":
      return "The shop with the fullest board for what you are printing — more finishes, more sizes, sample photos of its own work.";
    case "speed":
      return "The shop that turns your job around soonest, even if it is across the city.";
    case "distance":
      return "The shop nearest your drop-off, so it travels the shortest way to you.";
  }
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}

/**
 * A ranking is complete only when it is all three, each exactly once. A
 * half-ranked list cannot match and must never be treated as one.
 */
export function isCompleteRanking(value: unknown): value is PriorityRanking {
  if (!Array.isArray(value) || value.length !== PRIORITIES.length) return false;
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isPriority(entry) || seen.has(entry)) return false;
    seen.add(entry);
  }
  return true;
}

/** 1, 2 or 3. Null when this priority has not been placed yet. */
export function rankOf(order: readonly Priority[], priority: Priority): number | null {
  const index = order.indexOf(priority);
  return index === -1 ? null : index + 1;
}

/**
 * Tap-to-place, the way the ranking screen builds an order.
 *
 * Tapping an unplaced priority puts it next. Tapping a placed one takes it back
 * out along with everything ranked after it, because a client correcting second
 * place has not yet decided third — leaving third in place would silently
 * promote it.
 */
export function togglePlacement(
  order: readonly Priority[],
  priority: Priority,
): Priority[] {
  const index = order.indexOf(priority);
  if (index === -1) return [...order, priority];
  return order.slice(0, index);
}

/** The order, as one sentence a client can check at a glance. */
export function rankingSentence(order: readonly Priority[]): string {
  if (order.length === 0) return "Nothing ranked yet.";
  const names = order.map((priority) => priorityLabel(priority).toLowerCase());
  if (order.length < PRIORITIES.length) {
    return `So far: ${names.join(", then ")}.`;
  }
  return `GRIDGO matches on ${names[0]} first, then ${names[1]}, then ${names[2]}.`;
}

/** Where the client is asked to rank, and where they go back to change it. */
export const PRIORITIES_ROUTE = "/priorities";
