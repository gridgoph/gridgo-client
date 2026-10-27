/**
 * Sharing a delivered order (gridgo-client#341; gridgo-api
 * `docs/SHARING_AND_REMINDERS_API.md`).
 *
 * After a sent survey the client is offered a story image — GRIDGO's own
 * design, never a photo — with "Delivered by GRIDGO", their first name, the
 * Founding Tester label when it was awarded, and their invite. GRIDGO decides
 * when the card is due (`showAfterSurvey`, `showFromOrder`); this module only
 * reads those flags, words the card, and says what goes into the share sheet.
 *
 * Sharing is never rewarded. A tap is counted, nothing more, and no copy here
 * may suggest a tap earns anything.
 */

import type { Order, OrderShare, User } from "@/lib/api";
import { mayHaveSurvey } from "@/lib/foundingTester";

export const SHARE_CARD_TITLE = "Share your GRIDGO moment";
export const SHARE_CARD_BODY = "Post it to your story, or send your invite link to a friend.";
export const SHARE_CARD_BODY_NO_LINK = "Post it to your story. Your friends can sign up with your invite code.";
export const SHARE_LABEL = "Share";
export const SEND_TO_FRIEND_LABEL = "Send to a friend";
export const MAYBE_LATER_LABEL = "Maybe later";
export const SHARE_DONE_LABEL = "Done";
export const SHARE_ORDER_LABEL = "Share";
export const SHARE_ORDER_A11Y = "Share this order as a story";

/** Said on Android, where the share sheet takes the picture without the text. */
export const LINK_COPIED_ON_SHARE = "Your invite link is copied when you share, so you can paste it into your post.";
export const LINK_COPIED = "Invite link copied. Paste it into your post.";
export const SHARE_FAILED = "Sharing did not open on this phone.";
export const SHARE_FAILED_COPIED = "Sharing did not open on this phone. Your invite link is copied instead.";
export const SHARE_TEXT_ONLY =
  "This version of GRIDGO can share your invite as text only. Update the app to share the picture.";
export const SHARE_LOAD_FAILED = "GRIDGO could not get your share card ready. Check your connection and try again.";
export const SHARE_NOT_AVAILABLE = "This order cannot be shared yet. Sharing opens once it has been delivered.";

/** Fixed lines on the story image. */
export const STORY_HEADLINE = ["Delivered", "by GRIDGO"] as const;
export const STORY_FOUNDING_TESTER = "Founding Tester";
export const STORY_SCAN = "Scan to print with GRIDGO";
export const STORY_CODE_HEADING = "Sign up with my invite code";

/** The story image, in pixels: a 9:16 phone story. */
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

/** Where the card was opened from. `manual` is the order's own Share button: no card events. */
export type SharePresentation = "after_survey" | "order_repeat" | "manual";

export function isSharePresentation(value: unknown): value is SharePresentation {
  return value === "after_survey" || value === "order_repeat" || value === "manual";
}

/** The automatic card is the one whose showing, putting off and closing GRIDGO records. */
export function recordsCard(presentation: SharePresentation): presentation is "after_survey" | "order_repeat" {
  return presentation !== "manual";
}

/**
 * Orders whose share data is worth reading: delivered or collected ones, and
 * any order a survey may be sent for (a failed order can have one too). GRIDGO's
 * `available` is still the answer; this only saves a read on a job in progress.
 */
export function mayShareOrder(
  user: Pick<User, "foundingTester"> | null | undefined,
  order: Pick<Order, "state" | "timeline" | "issueWindowOpenedAt">,
): boolean {
  if (mayHaveSurvey(user, order)) return true;
  if (order.issueWindowOpenedAt) return true;
  return (order.timeline ?? []).some((entry) => entry.state === "delivered");
}

/**
 * The repeat is offered on a later visit to the order, never in the same
 * session that put the card off: "Maybe later" followed straight away by the
 * same card on the order screen behind it would not be later.
 */
export function repeatDue(share: OrderShare | null | undefined, putOffThisSession: boolean): boolean {
  return Boolean(share?.available && share.card.showFromOrder && !putOffThisSession);
}

/** The first name, trimmed; GRIDGO sends `""` when there is no saved name. */
export function storyName(share: Pick<OrderShare, "firstName">): string | null {
  const name = share.firstName.trim();
  return name ? name : null;
}

export function storyGreeting(share: Pick<OrderShare, "firstName">): string | null {
  const name = storyName(share);
  return name ? `Printed for ${name}` : null;
}

/**
 * What goes beside the picture in the share sheet. With a link, the link; with
 * only a code, the code. Never a link GRIDGO did not send.
 */
export function shareText(share: Pick<OrderShare, "inviteLink" | "inviteCode">): string {
  if (share.inviteLink) return `My order was delivered by GRIDGO, the print app for Davao. Sign up with my link: ${share.inviteLink}`;
  if (share.inviteCode) return `My order was delivered by GRIDGO, the print app for Davao. Sign up with my invite code: ${share.inviteCode}`;
  return "My order was delivered by GRIDGO, the print app for Davao.";
}

/** The code grouped in fours so it can be read aloud or typed. */
export function groupedCode(code: string): string {
  return code.replace(/\s+/g, "").match(/.{1,4}/g)?.join(" ") ?? code;
}

/**
 * The link as printed under the QR: without the scheme, which nobody types.
 * Long links are printed whole on two lines rather than cut, because a cut
 * link is a wrong link.
 */
export function printedLink(link: string, perLine = 34): string[] {
  const bare = link.replace(/^https?:\/\//i, "");
  if (bare.length <= perLine) return [bare];
  const lines: string[] = [];
  for (let start = 0; start < bare.length; start += perLine) lines.push(bare.slice(start, start + perLine));
  return lines;
}

/** Errors from the share routes, in words. */
export function shareErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "order_share_not_available") return SHARE_NOT_AVAILABLE;
  return SHARE_LOAD_FAILED;
}

/** A tap refusal that will never succeed on retry: drop it rather than keep resending. */
export function tapRefusalIsFinal(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
}
