/**
 * User-facing copy helpers.
 *
 * No API state string, snake_case id, or internal enum reaches the screen.
 * Errors explain what happened and how to recover — never apologise alone.
 */

import { ApiError } from "@/lib/api";

/**
 * Where an order stands on money, in plain language.
 *
 * There is no companion "payment method" label any more: the platform takes
 * one method, so naming it on every order said nothing the client could act on.
 */
export function paymentStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "unpaid":
      return "Nothing paid yet";
    case "downpayment_pending":
      return "Downpayment being checked";
    case "downpayment_confirmed":
      return "Downpayment confirmed";
    case "paid":
      return "Paid in full";
    // Migrated orders that cleared under the single-authorization model.
    case "authorized":
      return "Downpayment confirmed";
    default:
      return status ? "Payment update" : "Nothing paid yet";
  }
}

/** One installment's own state, for the row that names it. */
export function installmentStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "pending_confirmation":
      return "Being checked";
    case "confirmed":
      return "Confirmed";
    case "legacy_confirmed":
      return "Confirmed";
    default:
      return "Not paid yet";
  }
}

/** Platform roles, named as a person would name the app they belong to. */
const ROLE_APP_LABELS: Record<string, string> = {
  client: "GRIDGO Client",
  supplier: "GRIDGO Supplier",
  rider: "GRIDGO Rider",
  ops_admin: "GRIDGO Operations",
  super_admin: "GRIDGO Operations",
};

/**
 * Which GRIDGO app an account belongs to.
 *
 * A rejected sign-in must never print the role as the platform stores it —
 * "ops_admin" is an internal value, and a client reading it learns nothing.
 */
export function roleAppLabel(role: string | null | undefined): string {
  if (!role) return "another GRIDGO app";
  return ROLE_APP_LABELS[role] ?? "another GRIDGO app";
}

/**
 * Client login refused an identity that is not a client.
 * Never name the other app — that would confirm who this email belongs to.
 */
export const clientEmailUnavailableMessage =
  "This email is not available. Try a different email.";

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
      // ---- payment: 75% downpayment, then 25% balance, both by QR ----
      case "payment_route_retired":
        return "This order takes the QR downpayment and balance now. Pull it down to refresh, then pay the amount it asks for.";
      case "payment_method_not_allowed":
        return "GRIDGO takes payment by QR only — GCash, Maya or a bank e-wallet. There is no cash on delivery.";
      // ---- basket: the shop's minimum run ----
      case "below_minimum_quantity": {
        const minimum =
          typeof error.body === "object" && error.body && "minimumOrderQuantity" in error.body
            ? Number((error.body as { minimumOrderQuantity: unknown }).minimumOrderQuantity)
            : NaN;
        return Number.isInteger(minimum) && minimum > 0
          ? `This shop takes orders of ${minimum} and up. Change the quantity and try again.`
          : "This shop takes a minimum quantity. Change the quantity and try again.";
      }
      case "assignment_notification_required":
        return "This job has no final price yet, so there is nothing to pay. You get a notification the moment a supplier accepts it.";
      case "payment_already_submitted":
        return "A reference for this payment is already with Operations. Pull the order down to see whether it has been confirmed.";
      case "payment_not_pending":
        return "There is no payment waiting to be checked on this job. Pull the order down to see where it got to.";
      case "payment_reference_required":
        return "Enter the reference number from your payment receipt. Operations finds your transfer by it.";
      case "downpayment_not_confirmed":
        return "The balance opens once Operations confirms your downpayment. You get a notification when that happens.";
      case "downpayment_not_available":
        return "The downpayment is not open on this job yet. Pull it down to see what it is waiting on.";
      case "issue_already_open":
        return "You already have a report open on this job. Operations is reviewing it — add anything else to that one rather than opening a second.";
      case "issue_window_not_open":
        return "This job is not waiting on your confirmation right now. Pull it down to see where it got to.";
      case "issue_open":
        return "You have a problem reported on this job, so it cannot be closed as fine. Operations closes it once that report is settled.";
      case "issue_window_closed":
        return "This job has been signed off, so the issue window is closed. Message Operations if something is still wrong with it.";
      case "invalid_issue":
        return "Describe what is wrong before sending the report — Operations acts on your words alone.";
      case "reason_required":
        return "Say what needs to change. Operations reworks the artwork from this reason.";
      case "proof_decision_not_allowed":
        return "There is no proof waiting on your decision right now. Pull this order again to see where it got to.";

      // ---- creating an account ----
      case "email_already_registered":
        return "This email already has a GRIDGO account. Sign in with it instead, or use another address.";
      case "invalid_email":
        return "Enter a complete email address, like ana@company.com.";
      case "invalid_password":
        return "Use a password with at least 8 characters.";
      case "name_required":
        return "Enter the name this account belongs to.";
      case "phone_required":
        return "Enter a number Operations can reach you on about a job.";
      case "invalid_account_type":
        return "Choose whether this account is personal, a business, or an organization.";
      case "organization_name_required":
        return "Enter the business or organization name this account trades under.";
      case "profile_incomplete":
        return "Tell GRIDGO whether this account is personal, a business, or an organization.";
      case "invitation_required":
        return "This identity is not a GRIDGO client. Suppliers, riders, and Operations use their own app.";

      // ---- the account's own details, and the business upgrade ----
      // `src/account-profile-routes.js` writes plain sentences of its own and
      // names the field it refused, so most of these pass the server's wording
      // through rather than restating it worse. Only the two the client cannot
      // act on are replaced.
      case "invalid_account_profile":
      case "org_name_required":
      case "org_name_not_allowed":
      case "contact_name_required":
      case "contact_phone_required":
        return apiMessage(error) ?? fallback;
      case "account_version_conflict":
        return "Your account changed somewhere else while this screen was open. Load the latest, then make your change again.";
      case "expected_version_required":
        return "GRIDGO could not tell which version of your account this change was for. Load the latest and try again.";
      case "client_profile_unavailable":
      case "membership_required":
        return "This identity is not a GRIDGO client account, so its details cannot be changed here.";

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

/**
 * The sentence the API sent, where it wrote one worth reading.
 *
 * GRIDGO's newer routes answer with real copy — "Enter a Philippine mobile
 * number, for example 0917 123 4567." — and restating that here in worse words
 * is how two sources of truth start disagreeing. Only used for codes listed
 * above: an unmapped code still falls back, so no internal string leaks.
 */
function apiMessage(error: ApiError): string | null {
  const body = error.body;
  if (typeof body !== "object" || body === null || !("message" in body)) return null;
  const message = (body as { message: unknown }).message;
  return typeof message === "string" && message.trim() ? message : null;
}
