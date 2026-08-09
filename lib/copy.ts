/**
 * User-facing copy helpers.
 *
 * No API state string, snake_case id, or internal enum reaches the screen.
 * Errors explain what happened and how to recover — never apologise alone.
 */

import { ApiError, formatPhp } from "@/lib/api";

/** Payment method as the user chose it. */
export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "Not chosen yet";
  if (method === "pilot_credit") return "Pilot Credits";
  if (method === "cod") return "Cash on Delivery";
  return "Payment";
}

/** Payment status in plain language. */
export function paymentStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "unpaid":
      return "Unpaid";
    case "authorized":
      return "Authorized";
    case "collected":
      return "Collected";
    case "reconciled":
      return "Reconciled";
    default:
      return status ? "Payment update" : "Unpaid";
  }
}

export function formatPaymentSummary(
  method: string | null | undefined,
  status: string | null | undefined,
): string {
  if (!method) return paymentStatusLabel(status);
  return `${paymentMethodLabel(method)} · ${paymentStatusLabel(status)}`;
}

/**
 * Timeline actor: who did this, in roles the client understands.
 * Never surfaces raw user ids.
 */
export function actorLabel(by: string | null | undefined): string {
  if (!by) return "Unknown";
  if (by === "system") return "System";
  if (by === "user_client" || by.endsWith("_client")) return "You";
  if (by === "user_supplier" || by.includes("supplier")) return "Supplier";
  if (by === "user_rider" || by.includes("rider")) return "Rider";
  if (by === "user_ops" || by.includes("ops")) return "Operations";
  if (by === "user_admin" || by.includes("admin")) return "Operations";
  if (by.startsWith("user_")) return "Team member";
  return "Team member";
}

/**
 * Map network / API failures to recovery-oriented plain language.
 * Never leak error codes like `transition_not_allowed` to the UI.
 */
export function userFacingError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const code =
      typeof error.body === "object" && error.body && "error" in error.body
        ? String((error.body as { error: string }).error)
        : error.message;

    switch (code) {
      case "invalid_credentials":
        return "Wrong email or password. Check both and try again.";
      case "unauthorized":
        return "Your session expired. Sign in again to continue.";
      case "forbidden":
        return "You do not have permission for that action.";
      case "order_not_found":
        return "That order was not found. Open Orders and pick it again.";
      case "transition_not_allowed":
      case "invalid_state":
        return "This order is not ready for that action yet. Pull to refresh, or check the timeline.";
      case "insufficient_credits": {
        const body = error.body as { needMinor?: number; balanceMinor?: number };
        if (body.needMinor != null && body.balanceMinor != null) {
          const short = body.needMinor - body.balanceMinor;
          return `Your Pilot Credits balance is ${formatPhp(Math.max(0, short))} short of this order. Choose Cash on Delivery if it is eligible, or ask Operations to top up the pilot grant.`;
        }
        return "Not enough Pilot Credits for this order. Choose Cash on Delivery if it is eligible, or ask Operations to top up the pilot grant.";
      }
      case "cod_limit":
      case "cod_not_eligible":
        return "Cash on Delivery only covers orders up to ₱1,500 including delivery. Pay with Pilot Credits instead.";
      case "cod_one_active":
        return "You already have an unpaid Cash on Delivery order. Finish or pay that one before starting another.";
      case "not_found":
        return "Nothing was found for that request. Go back and try again.";
      default:
        if (error.status >= 500) {
          return "The server had a problem. Wait a moment, then try again.";
        }
        if (error.status === 0 || error.status >= 400) {
          // Prefer fallback over raw code when we have no map entry
          if (/^[a-z0-9_]+$/i.test(code)) return fallback;
          return code || fallback;
        }
        return fallback;
    }
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("network") ||
      msg.includes("failed to fetch") ||
      msg.includes("load failed")
    ) {
      return "Cannot reach the server. Check that you are on the same network as the demo API, then try again.";
    }
    if (/^[a-z0-9_]+$/i.test(error.message)) return fallback;
    return error.message;
  }

  return fallback;
}
