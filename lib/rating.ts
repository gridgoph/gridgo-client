/**
 * Rating the shop that printed the job.
 *
 * Three of the four things a client ranks when choosing a shop come back as
 * things they can judge afterwards: quality, speed and value. Distance does
 * not — GRIDGO chose the shop, the client never saw where it was, and asking
 * somebody to rate a decision they did not make and cannot see is asking for
 * noise.
 *
 * The client never learns which shop ran the job, so this is not a review of a
 * business by name. It is the evidence matching uses to send the next job to
 * somebody who did this one well, which is why quality carries into ranking
 * and the other two are recorded without steering it.
 */

import { ApiError, type Order } from "@/lib/api";

/** What a client is asked to judge, in the order they are asked. */
export const RATED_FACTORS = ["quality", "speed", "value"] as const;

export type RatedFactor = (typeof RATED_FACTORS)[number];

export type RatingScores = Record<RatedFactor, number>;

export const NO_SCORES: RatingScores = { quality: 0, speed: 0, value: 0 };

export function factorLabel(factor: RatedFactor): string {
  switch (factor) {
    case "quality":
      return "Quality";
    case "speed":
      return "Speed";
    case "value":
      return "Value";
  }
}

/**
 * What each factor actually means here.
 *
 * Deliberately about this job rather than about the shop: a client who waited
 * three days for a two-day promise is rating that, not a reputation they have
 * no way to know.
 */
export function factorBlurb(factor: RatedFactor): string {
  switch (factor) {
    case "quality":
      return "The print itself — colour, sharpness, cutting and finish.";
    case "speed":
      return "Whether it arrived by the date you were promised.";
    case "value":
      return "Whether what you got was worth what you paid.";
  }
}

/** What a given number of stars means, said in words as well as shape. */
export function starWord(stars: number): string {
  switch (stars) {
    case 1:
      return "Poor";
    case 2:
      return "Below what I expected";
    case 3:
      return "About what I expected";
    case 4:
      return "Better than I expected";
    case 5:
      return "Excellent";
    default:
      return "Not rated yet";
  }
}

/**
 * Whether this order can be rated at all.
 *
 * Only once it is finished. A rating on an open job is a bargaining chip, and
 * the platform refuses one — so an app that offered it would be walking the
 * client into a refusal.
 */
export function canRate(order: Pick<Order, "state" | "rated"> | null | undefined): boolean {
  if (!order || order.rated) return false;
  return order.state === "completed" || order.state === "payout_released";
}

/** Whether the client has answered enough to send. */
export function isComplete(scores: RatingScores): boolean {
  return RATED_FACTORS.every((factor) => scores[factor] >= 1 && scores[factor] <= 5);
}

/** The first thing still unanswered, so the screen can say what is missing. */
export function firstUnrated(scores: RatingScores): RatedFactor | null {
  return RATED_FACTORS.find((factor) => !scores[factor]) ?? null;
}

/** The platform's field names, which are not the ones the screen uses. */
export function toRequest(
  scores: RatingScores,
  comment: string,
): { qualityStars: number; speedStars: number; valueStars: number; comment?: string } {
  const trimmed = comment.trim();
  return {
    qualityStars: scores.quality,
    speedStars: scores.speed,
    valueStars: scores.value,
    ...(trimmed ? { comment: trimmed } : {}),
  };
}

/** The platform's cap, mirrored so the screen can hold to it rather than be refused. */
export const COMMENT_MAX = 2_000;

/**
 * A refusal as a sentence naming what to do about it.
 *
 * `already_rated` is the one worth care: it means another device or an earlier
 * tap got there first, which is not an error the client did anything to cause.
 */
export function ratingErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = (error.body as { error?: string } | null)?.error ?? "";
    switch (code) {
      case "already_rated":
        return "This order has already been rated. Thanks — nothing more to do.";
      case "order_not_complete":
        return "This order is not finished yet. You can rate it once it is delivered and the check window has closed.";
      case "order_has_no_shop":
        return "This order was never run by a shop, so there is nothing to rate.";
      case "invalid_rating":
        return "Give quality, speed and value a rating from one to five stars each.";
      case "forbidden":
        return "You can only rate your own orders.";
      case "unauthorized":
        return "Your session expired. Sign in again, then rate this order.";
      default:
        return "That rating did not save. Try again in a moment.";
    }
  }
  return "That rating did not save. Check your signal and try again.";
}

/** True when the refusal means the job is already done rather than failed. */
export function isAlreadyRated(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.body as { error?: string } | null)?.error === "already_rated"
  );
}
