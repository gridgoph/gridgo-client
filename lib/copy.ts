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
 *
 * `paidInFull` is `paysInFull(order)` from `lib/payment.ts`: on that plan the
 * one up-front payment is the whole total, so it is never called a downpayment.
 */
export function paymentStatusLabel(status: string | null | undefined, paidInFull = false): string {
  switch (status) {
    case "unpaid":
      return "Nothing paid yet";
    case "downpayment_pending":
      return paidInFull ? "Payment being checked" : "Downpayment being checked";
    case "downpayment_confirmed":
      return paidInFull ? "Paid in full" : "Downpayment confirmed";
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
    // The balance on an order paid in full up front.
    case "not_required":
      return "Not needed";
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
export function actorLabel(by: unknown): string {
  if (typeof by !== "string" || !by) return "Unknown";
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
      // ---- payment: by QR, in full or (older orders) in two halves ----
      case "payment_route_retired":
        return "This order takes payment by QR now. Pull it down to refresh, then pay the amount it asks for.";
      case "balance_not_required":
        return "This order was paid in full up front, so there is no balance to pay. Pull it down to refresh.";
      case "payment_method_not_allowed":
        return "GRIDGO takes payment by QR only — GCash, Maya or a bank e-wallet. There is no cash on delivery.";
      // ---- handover: hub claim and delivery codes (gridgo-api#124/#125) ----
      case "handover_not_ready":
        return "This order is not waiting for a handover right now. Pull it down to see where it got to.";
      case "redelivery_not_available":
        return "Redelivery opens after three missed hub days, while your order is still at the hub. Pull it down to refresh.";
      case "redelivery_cost_acceptance_required":
        return "Redelivery is at your own cost. Confirm that to send the request.";
      // ---- artwork: design links ----
      case "artwork_link_rate_limited":
        return "That is a lot of link checks in one minute. Wait a moment, then check again.";
      case "invalid_artwork_link":
      case "invalid_artwork_links":
        return "That link is not one GRIDGO can keep. Copy the https:// link again from the Share menu.";
      case "unsafe_artwork_url":
        return "That link points somewhere private. Use the public sharing link instead.";
      case "artwork_link_unresolved":
        return "That short link did not lead to a design. Open the design and copy its full address.";
      case "artwork_link_format_not_accepted":
        return "This shop does not take that kind of link. Paste a different one, or upload the file.";
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
      // ---- basket: several shops, one date, one payment (gridgo-api#117) ----
      case "basket_deadline_required":
        return "Your order is printed by more than one shop, so it needs one date for all of them. Choose a date and try again.";
      case "basket_deadline_mismatch":
        return "Everything in one order shares one date. GRIDGO looked again with your order's date — pick from the new answer.";
      case "deadline_not_met":
        return "A shop in your order can no longer make your date. Choose a later date for the whole order, or remove that item.";
      case "cart_group_not_found":
        return "That shop group is no longer in your order. Add this as a new product instead.";
      case "basket_payment_required":
        return "This order is paid as one payment for every shop in it. Open the order and send the payment from there.";
      // ---- basket: the press's widest print ----
      case "printer_cap_exceeded": {
        const cap =
          typeof error.body === "object" && error.body && "printerMaxWidthFeet" in error.body
            ? Number((error.body as { printerMaxWidthFeet: unknown }).printerMaxWidthFeet)
            : NaN;
        return Number.isInteger(cap) && cap > 0
          ? `This printer prints up to ${cap} ft wide. Make it ${cap} ft wide or less and try again.`
          : "This is wider than this printer prints. Make it narrower and try again.";
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
        return "Payment is not open on this job yet. Pull it down to see what it is waiting on.";
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
      case "physical_invoice_already_requested":
        return "A physical invoice has already been requested for this order.";
      case "physical_invoice_not_found":
        return "There is no physical-invoice request on this order yet.";
      case "invoice_not_found":
        return "GRIDGO has not issued a receipt for this order yet.";

      // ---- refunds (docs/REFUNDS_API.md in gridgo-api) ----
      case "refund_window_closed":
        return "The time to ask for a refund in the app has passed. Message GRIDGO support and they will take it from there.";
      case "refund_already_open":
        return "This order already has a refund request open. Pull the order down to see where it stands.";
      case "refund_payment_not_verified":
        return "Operations has not confirmed your payment yet, so there is nothing to refund. Ask again once it is confirmed.";
      case "refund_collection_reconciliation_required":
        return "Operations is still checking a payment on this order. Ask again once it is confirmed, or message GRIDGO support.";
      case "refund_stale":
        return "This refund changed while the screen was open. Pull down to load the latest, then try again.";
      case "refund_idempotency_conflict":
        return "GRIDGO saw two different versions of this request. Go back, open the order again, and send it once more.";
      case "refund_state_conflict":
        return "This refund has moved on since the screen loaded. Pull down to see where it stands.";
      case "refund_destination_locked":
        return "Operations has started sending your refund, so the receiving account cannot change now. Message GRIDGO support if it is wrong.";
      case "refund_qr_ownership_required":
        return "Confirm the receiving account is your own. GRIDGO returns money only to the person who paid.";
      case "invalid_refund_file":
      case "file_already_attached":
        return "That image could not be used. Upload the QR again and send it once it shows Uploaded.";
      case "invalid_refund_provider":
        return "Choose GCash, Maya, Bank or Other wallet for the receiving QR.";
      case "invalid_refund_evidence":
        return "Attach up to ten photos, each one only once.";
      case "invalid_refund_kind":
        return "Choose whether you are cancelling the order or reporting something wrong with it.";
      case "invalid_refund_request":
        return "Check the reason and the name on the account, then send it again.";
      case "refund_fulfillment_stopped":
        return "This job is paused for your refund request, so nothing else can happen on it until Operations decides.";

      // ---- the shop could not take the order (docs/SHOP_RECOVERY_API.md) ----
      case "shop_recovery_offer_changed":
        return "GRIDGO checked the offer again while you were deciding. Look at the date shown now, then choose again.";
      case "shop_recovery_stale":
      case "shop_recovery_not_available":
        return "This choice has moved on since the screen loaded. The order below shows where it stands now.";
      case "shop_recovery_requires_operations":
        return "Operations has to settle this one. They will contact you about what happens next.";
      case "shop_recovery_full_refund_required":
        return "You chose a full refund. Operations settles everything you paid before anything else happens.";

      // ---- the shop asked for more time (docs/ORDER_RESCHEDULE_API.md) ----
      case "reschedule_expired":
        return "The 24 hours to answer have passed. Your original date stays, and Operations will contact you.";
      case "reschedule_already_answered":
      case "reschedule_stale":
      case "reschedule_not_available":
        return "This request has moved on since the screen loaded. The order below shows where it stands now.";
      case "reschedule_offer_expired":
      case "reschedule_offer_stale":
        return "That shop's offer changed or ran out. Check again for the current one.";
      case "reschedule_rematch_unavailable":
        return "There is no other shop to choose on this order right now. The order below shows what you can do.";
      case "reschedule_operations_required":
        return "Operations has to settle this one. They will contact you about what happens next.";
      case "reschedule_refund_unavailable":
        return "A refund cannot be requested from here right now. The order below shows where it stands.";

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

/** Refund screens read the same map; the name says which codes it was written for. */
export const refundErrorMessage = userFacingError;

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
