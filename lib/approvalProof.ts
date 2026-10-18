/**
 * The client's approval of an order, and the record GRIDGO keeps of it
 * (gridgo-client#248; gridgo-api `docs/APPROVAL_PROOF_API.md`).
 *
 * GRIDGO decides how an order is approved, never the phone: a basket line
 * says `approvalMethod`, and a basket is signed by hand when any of its lines
 * is (custom merchandise), otherwise approved with one tap. A sample in its
 * proof step is always signed, with a photo of the sample received. Whatever
 * the method, the client sees what they are approving before they approve it.
 *
 * The record is evidence of what a correct print is. A `legacy_unrecorded`
 * record means no approval was collected — it is never drawn as signed or
 * approved.
 */

import Constants from "expo-constants";
import { Platform } from "react-native";

import {
  ApiError,
  type ApprovalBody,
  type ApprovalMethod,
  type ApprovalProofRecord,
  type ApprovalSnapshot,
  type ApprovalSnapshotItem,
  type Cart,
  type CartLineRecord,
  type Order,
} from "@/lib/api";
import { lineAttachments } from "@/lib/artworkAttachments";
import { acceptedOn, warningCopy } from "@/lib/artworkGuidance";
import { lineName, lineOptionLabels } from "@/lib/basket";
import { quantityUnit } from "@/lib/colourPricing";
import { linkDisplay, linkLabel, lineArtworkLinks } from "@/lib/designLink";
import { installationId } from "@/lib/legalContext";
import { layoutLabel } from "@/lib/printLayout";

/** The words a one-tap approval records, exactly as GRIDGO stores them. */
export const APPROVAL_STATEMENT = "I approve this order";

/** What an approval binds the client to, said before they give it. */
export const APPROVAL_MEANING =
  "GRIDGO keeps this approval with your order. If there is ever a disagreement about the print, what you approved here is what a correct print is.";

export const DRAWN_REASON =
  "This order includes custom merchandise, so GRIDGO asks for your signature rather than a tap.";

export const SAMPLE_PHOTO_REASON =
  "Take a photo of the printed sample you received. GRIDGO keeps it with your signature, so everyone can see what you approved.";

/**
 * How this basket is approved, or null when GRIDGO does not say (an API from
 * before approvals): then nothing is asked and nothing is sent.
 */
export function basketApprovalMethod(cart: Pick<Cart, "lines"> | null | undefined): ApprovalMethod | null {
  const methods = (cart?.lines ?? []).map((line) => line.approvalMethod).filter(Boolean);
  if (!methods.length) return null;
  return methods.includes("drawn") ? "drawn" : "one_tap";
}

/** The installation, platform and build that go with every approval. */
export async function approvalDevice(): Promise<ApprovalBody["device"]> {
  return {
    id: (await installationId()).slice(0, 160),
    platform: Platform.OS,
    appVersion: (Constants.expoConfig?.version?.trim() || "unknown").slice(0, 160),
  };
}

/** Plain words for every approval refusal, or null when the code is not one. */
export function approvalErrorMessage(code: string | null | undefined): string | null {
  switch (code) {
    case "approval_cart_stale":
      return "Your order changed after you approved it. Check it and approve it again.";
    case "approval_snapshot_stale":
      return "Something in this order changed after you signed. Check it and sign again.";
    case "approval_proof_required":
      return "GRIDGO needs your approval before this order can go ahead. Approve it and try again.";
    case "invalid_approval_file":
      return "Your signature or photo did not reach GRIDGO. Add it again and try once more.";
    case "file_not_ready":
      return "A file you added is still being saved. Try again in a moment.";
    case "approval_device_required":
      return "GRIDGO could not record this phone with your approval. Try again.";
    case "invalid_approval":
      return "GRIDGO could not record that approval. Approve again and try once more.";
    case "sample_approval_not_allowed":
      return "This proof is no longer waiting on you. Go back to the order to see where it is.";
    default:
      return null;
  }
}

/** The approval refusal GRIDGO answered with, or null for any other error. */
export function approvalRefusalCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const code = (error.body as { error?: unknown } | null)?.error;
  return typeof code === "string" && approvalErrorMessage(code) ? code : null;
}

/** True for the refusals that mean the client must review and approve again. */
export function approvalIsStale(code: string | null | undefined): boolean {
  return code === "approval_cart_stale" || code === "approval_snapshot_stale";
}

// ---------------------------------------------------------------------------
// What is being approved
// ---------------------------------------------------------------------------

/** One item as the client approves it, or approved it. */
export type ApprovalReviewItem = {
  key: string;
  name: string;
  quantity: string;
  specs: string[];
  artwork: string[];
  instructions: string | null;
  /** Upload warnings the client accepted, with when. */
  acceptedWarnings: string[];
};

/** "100 copies", or "Quantity 100" where the product names no unit. */
function quantityLine(quantity: number | undefined, mode: CartLineRecord["quantityMode"]): string {
  if (quantity == null || !Number.isFinite(Number(quantity))) return "—";
  if (mode) return `${quantity} ${quantityUnit(mode, Number(quantity))}`;
  return `Quantity ${quantity}`;
}

function acceptedWarningLines(guidance: CartLineRecord["artworkGuidance"]): string[] {
  const out: string[] = [];
  for (const file of guidance?.files ?? []) {
    for (const warning of file.warnings ?? []) {
      if (!warning.acceptedAt) continue;
      const when = acceptedOn(warning.acceptedAt);
      out.push(`${warningCopy(warning).title}${when ? ` · accepted ${when}` : " · accepted"}`);
    }
  }
  return out;
}

function linkLine(link: { url: string }): string {
  return `${linkLabel(link as Parameters<typeof linkLabel>[0])} · ${linkDisplay(link.url)}`;
}

/** A basket line as checkout asks the client to approve it. */
export function cartLineReview(line: CartLineRecord): ApprovalReviewItem {
  const entries = lineAttachments(line);
  const files = entries.filter((entry) => entry.kind === "file");
  const artwork = [
    ...files.map((entry, index) =>
      entry.label?.trim() || (files.length > 1 ? `Artwork file ${index + 1}` : "Artwork file"),
    ),
    ...lineArtworkLinks(line).map(linkLine),
  ];
  const specs = [...lineOptionLabels(line)];
  if (line.printLayout) specs.push(`Layout: ${layoutLabel(line.printLayout)}`);
  return {
    key: line.id,
    name: lineName(line),
    quantity: quantityLine(line.quantity, line.quantityMode),
    specs,
    artwork,
    instructions: line.specialInstructions?.trim() || null,
    acceptedWarnings: acceptedWarningLines(line.artworkGuidance),
  };
}

/** A frozen record's items, named the way they were when approved. */
export function snapshotReview(snapshot: ApprovalSnapshot | null | undefined): ApprovalReviewItem[] {
  const files = new Map((snapshot?.artwork ?? []).map((file) => [file.fileId, file]));
  const fileName = (fileId: string, fallback: string) => files.get(fileId)?.originalFilename?.trim() || fallback;

  const items = (snapshot?.items ?? []).map((item: ApprovalSnapshotItem, index): ApprovalReviewItem => {
    const attached = item.artworkAttachments ?? [];
    const fileIds = attached.length
      ? attached.flatMap((entry) => (entry.kind === "file" ? [entry.fileId] : []))
      : item.artworkFileId
        ? [item.artworkFileId]
        : [];
    const links = attached.length
      ? attached.flatMap((entry) => (entry.kind === "link" ? [entry] : []))
      : (item.artworkLinks ?? []);
    const specs = (item.options ?? [])
      .map((option) => option.optionLabelSnapshot?.trim())
      .filter((label): label is string => Boolean(label));
    if (item.printLayout) specs.push(`Layout: ${layoutLabel(item.printLayout)}`);
    return {
      key: item.id ?? `item-${index}`,
      name: item.itemNameSnapshot?.trim() || "Item",
      quantity: quantityLine(item.quantity, item.quantityMode),
      specs,
      artwork: [
        ...fileIds.map((fileId, at) => fileName(fileId, fileIds.length > 1 ? `Artwork file ${at + 1}` : "Artwork file")),
        ...links.map(linkLine),
      ],
      instructions: item.specialInstructions?.trim() || null,
      acceptedWarnings: acceptedWarningLines(item.artworkGuidance),
    };
  });
  if (items.length) return items;

  // A quoted job keeps its specification on the order rather than on lines.
  const spec = snapshot?.specification;
  if (!spec?.title) return [];
  return [
    {
      key: "specification",
      name: spec.title,
      quantity: quantityLine(spec.quantity, null),
      specs: [spec.size, spec.material, spec.finish].filter((value): value is string => Boolean(value?.trim())),
      artwork: [
        ...(snapshot?.artwork ?? []).map((file, at, all) =>
          file.originalFilename?.trim() || (all.length > 1 ? `Artwork file ${at + 1}` : "Artwork file"),
        ),
        ...(spec.artworkLinks ?? []).map(linkLine),
      ],
      instructions: spec.specialInstructions?.trim() || null,
      acceptedWarnings: acceptedWarningLines(spec.artworkGuidance),
    },
  ];
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

function davaoParts(at: string | null | undefined): Record<string, string> | null {
  const date = new Date(at ?? "");
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
}

/** When something was approved, in Davao time: "18 Oct 2026, 3:04 PM". */
export function approvalTime(at: string | null | undefined): string {
  const parts = davaoParts(at);
  if (!parts) return "Time not recorded";
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}

export type ApprovalRecordView = {
  title: string;
  /** Only true for a real approval. */
  approved: boolean;
  statusLabel: string;
  methodLabel: string | null;
  body: string | null;
};

type RecordLike = Pick<ApprovalProofRecord, "phase" | "status" | "method">;

/** How one record reads. A compatibility record never reads as approved. */
export function approvalRecordView(record: RecordLike): ApprovalRecordView {
  const title = record.phase === "sample" ? "Sample approval" : "Order approval";
  if (record.status === "approved") {
    return {
      title,
      approved: true,
      statusLabel: record.method === "drawn" ? "Signed" : "Approved",
      methodLabel:
        record.method === "drawn"
          ? record.phase === "sample"
            ? "Signed by hand, with a photo of the sample"
            : "Signed by hand"
          : record.method === "one_tap"
            ? `One tap: "${APPROVAL_STATEMENT}"`
            : null,
      body: null,
    };
  }
  if (record.status === "legacy_unrecorded") {
    return {
      title,
      approved: false,
      statusLabel: "No approval recorded",
      methodLabel: null,
      body: "This order was placed before GRIDGO asked for approval, so no approval was collected. GRIDGO kept a copy of what was ordered.",
    };
  }
  return { title, approved: false, statusLabel: "Not recorded", methodLabel: null, body: null };
}

/**
 * The one line under the folded "Approval record" heading, or null when the
 * order carries no approval summary at all (an API from before it).
 */
export function approvalSummaryLine(order: Pick<Order, "approvalProof">): string | null {
  const proof = order.approvalProof;
  if (!proof) return null;
  const latest = proof.records.at(-1);
  if (!latest) return proof.requirement?.required ? "Waiting for your approval" : "No approval recorded";
  const view = approvalRecordView(latest);
  if (!view.approved) return view.statusLabel;
  const parts = davaoParts(latest.at);
  return parts ? `${view.statusLabel} ${parts.day} ${parts.month}` : view.statusLabel;
}

/** The first characters of the fingerprint, grouped for reading aloud. */
export function shortFingerprint(sha256: string | null | undefined): string {
  const clean = (sha256 ?? "").replace(/[^0-9a-f]/gi, "").slice(0, 16).toUpperCase();
  return clean.replace(/(.{4})(?=.)/g, "$1 ");
}

export function approvalProofFileName(orderId: string): string {
  return `gridgo-approval-${orderId.replace(/[^a-z0-9_-]/gi, "")}.pdf`;
}
