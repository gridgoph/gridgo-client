/**
 * Light and dark, saved on the account (client#335, gridgo-api
 * `docs/CLIENT_HOME_API.md#theme-preference`).
 *
 * The phone keeps its own copy so the first frame after launch is already in
 * the right theme; the account is what makes the choice follow the client to
 * every screen and every phone. This module decides, purely, which of the two
 * wins when the account is read.
 */

export type ThemeChoice = "system" | "light" | "dark";

export type LocalTheme = {
  /** What this phone shows now. */
  preference: ThemeChoice;
  /** A tap the account has not stored yet (the save failed or was offline). */
  unsynced: boolean;
  /** The account this phone last reconciled with. */
  owner: string | null;
};

export type ThemeReconcile = {
  /** Apply this on the phone, or null to keep what is shown. */
  apply: ThemeChoice | null;
  /** Save this on the account, or null when the account is already right. */
  push: ThemeChoice | null;
};

/**
 * - A tap that has not reached this same account yet is sent again; the
 *   account's older value must not undo it.
 * - The first time this phone meets an account that still follows the phone
 *   (`system`, the default), a choice already made on this phone is kept and
 *   saved, so nobody who picked Dark in Settings before the account could
 *   hold it is switched back to Light.
 * - Otherwise the account wins.
 */
export function reconcileTheme(
  local: LocalTheme,
  userId: string,
  account: ThemeChoice | null,
): ThemeReconcile {
  if (local.unsynced && local.owner === userId) {
    return { apply: null, push: account === local.preference ? null : local.preference };
  }
  if (account == null) return { apply: null, push: null };
  if (local.owner !== userId && account === "system" && local.preference !== "system") {
    return { apply: null, push: local.preference };
  }
  return { apply: account === local.preference ? null : account, push: null };
}
