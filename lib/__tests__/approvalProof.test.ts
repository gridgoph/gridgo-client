import type { ApprovalProofRecord, CartLineRecord, Order } from "@/lib/api";
import {
  approvalErrorMessage,
  approvalIsStale,
  approvalRecordView,
  approvalSummaryLine,
  approvalTime,
  basketApprovalMethod,
  cartLineReview,
  shortFingerprint,
  snapshotReview,
} from "@/lib/approvalProof";
import { placeOrderBlockers, blockerLine } from "@/lib/checkout";
import { approvalStatus } from "@/store/approval";
import { checkoutLine, checkoutListing } from "@/test/checkoutFixtures";

const SIGNATURE = { width: 300, height: 180, strokes: [[{ x: 10, y: 100 }, { x: 200, y: 40 }]] };

function line(overrides: Partial<CartLineRecord> = {}): CartLineRecord {
  return checkoutLine(overrides);
}

describe("choosing how a basket is approved", () => {
  it("asks nothing when GRIDGO names no method (an API from before approvals)", () => {
    expect(basketApprovalMethod({ lines: [line()] })).toBeNull();
    expect(basketApprovalMethod({ lines: [] })).toBeNull();
    expect(basketApprovalMethod(null)).toBeNull();
  });

  it("is one tap for standard products", () => {
    expect(basketApprovalMethod({ lines: [line({ approvalMethod: "one_tap" }), line({ id: "b", approvalMethod: "one_tap" })] })).toBe("one_tap");
  });

  it("is a drawn signature when any line is custom merchandise", () => {
    expect(
      basketApprovalMethod({ lines: [line({ approvalMethod: "one_tap" }), line({ id: "b", approvalMethod: "drawn" })] }),
    ).toBe("drawn");
  });
});

describe("whether the approval still counts", () => {
  it("counts only for the version the client reviewed", () => {
    expect(approvalStatus(undefined, "one_tap", "3")).toBe("missing");
    expect(approvalStatus({ method: "one_tap", reviewed: "3", signature: null }, "one_tap", "3")).toBe("given");
    expect(approvalStatus({ method: "one_tap", reviewed: "3", signature: null }, "one_tap", "4")).toBe("stale");
  });

  it("never lets one tap stand in for a signature", () => {
    expect(approvalStatus({ method: "one_tap", reviewed: "3", signature: null }, "drawn", "3")).toBe("missing");
    expect(approvalStatus({ method: "drawn", reviewed: "3", signature: { ...SIGNATURE, strokes: [] } }, "drawn", "3")).toBe("missing");
    expect(approvalStatus({ method: "drawn", reviewed: "3", signature: SIGNATURE }, "drawn", "3")).toBe("given");
  });

  it("holds Place order until the tap or the signature, and says which", () => {
    const base = { lineCount: 1, linesMissingArtwork: 0, linesMissingDropoff: 0, referenceOk: true, hasProof: true, hasSettings: true };
    expect(placeOrderBlockers({ ...base })).toEqual([]);
    expect(placeOrderBlockers({ ...base, approval: "one_tap" })).toEqual(["approval"]);
    expect(placeOrderBlockers({ ...base, approval: "drawn" })).toEqual(["approval_signature"]);
    expect(blockerLine("approval")).toBe('Tick "I approve this order" at the end of this page.');
    expect(blockerLine("approval_signature")).toBe("Sign to approve your order at the end of this page.");
  });

  it("names the refusals that mean approving again", () => {
    expect(approvalIsStale("approval_cart_stale")).toBe(true);
    expect(approvalIsStale("approval_snapshot_stale")).toBe(true);
    expect(approvalIsStale("approval_proof_required")).toBe(false);
    expect(approvalErrorMessage("approval_cart_stale")).toMatch(/changed after you approved/);
    expect(approvalErrorMessage("something_else")).toBeNull();
  });
});

describe("what the client is shown before approving", () => {
  it("restates the item, quantity, options, artwork, note and accepted warnings", () => {
    const review = cartLineReview(
      line({
        quantity: 3,
        optionIds: ["o_a4"],
        listing: checkoutListing({
          name: "Event shirts",
          optionGroups: [
            {
              id: "g", name: "Size", kind: "spec", helpText: null, required: true, selectionMode: "single",
              sortOrder: 0, version: 1,
              options: [{ id: "o_a4", label: "Large", priceModifierMinor: 0, specBinding: null, sortOrder: 0 }],
            },
          ],
        }),
        artworkLinks: [{ formatCode: "canva_link", url: "https://www.canva.com/design/abc/view?utm=1" }],
        specialInstructions: "Logo on the left chest",
        artworkGuidance: {
          subcategoryCode: "shirts", minimumDpi: 300, acceptsRgb: false, expectedColorMode: "cmyk", orderedSize: null,
          openWarningCount: 0,
          files: [
            {
              fileId: "file_art", colorMode: "rgb", pixelWidth: 100, pixelHeight: 100, effectiveDpi: 120,
              warnings: [
                { code: "low_resolution", effectiveDpi: 120, minimumDpi: 300, acceptedAt: "2026-10-18T06:00:00.000Z" },
                { code: "color_mode", colorMode: "rgb", expectedColorMode: "cmyk", acceptedAt: null },
              ],
            },
          ],
        },
      }),
    );
    expect(review).toEqual({
      key: "cline_1",
      name: "Event shirts",
      quantity: "Quantity 3",
      specs: ["Large"],
      artwork: ["Artwork file", "Canva link · canva.com/design/abc/view"],
      instructions: "Logo on the left chest",
      acceptedWarnings: ["Lower resolution than recommended · accepted 18 Oct, 2:00 PM"],
    });
  });
});

const RECORD: ApprovalProofRecord = {
  id: "apr_1",
  version: 1,
  phase: "checkout",
  status: "approved",
  method: "drawn",
  at: "2026-10-18T06:30:00.000Z",
  account: { id: "u", name: "Sample Client" },
  device: { id: "client-x", platform: "web", appVersion: "1.0.0" },
  statement: "I approve this order",
  signatureFileId: "file_sig",
  samplePhotoFileId: null,
  snapshot: {
    items: [
      {
        id: "oli_1",
        itemNameSnapshot: "Event shirts",
        quantity: 20,
        artworkFileId: "file_art",
        options: [{ optionLabelSnapshot: "Large" }],
        specialInstructions: "Logo on the left chest",
      },
    ],
    artwork: [{ fileId: "file_art", originalFilename: "shirt-front.png" }],
  },
  snapshotSha256: "9f2c1a7be4d05c3388aa",
};

describe("the approval record", () => {
  it("draws what was approved from the frozen snapshot, unchanged by later edits to the order", () => {
    const before = snapshotReview(RECORD.snapshot);
    // The record is drawn from the snapshot alone: an order edited since, or
    // a listing renamed since, has no way into it.
    const edited: Partial<Order> = { title: "Renamed shirts", quantity: 99, approvalProof: { requirement: null, records: [RECORD] } };
    expect(snapshotReview(RECORD.snapshot)).toEqual(before);
    expect(JSON.stringify(before)).not.toContain(String(edited.title));
    expect(before).toEqual([
      {
        key: "oli_1",
        name: "Event shirts",
        quantity: "Quantity 20",
        specs: ["Large"],
        artwork: ["shirt-front.png"],
        instructions: "Logo on the left chest",
        acceptedWarnings: [],
      },
    ]);
  });

  it("falls back to a quoted job's own specification", () => {
    expect(
      snapshotReview({ items: [], specification: { title: "Tarpaulin", quantity: 2, size: "3x6 ft", material: "Vinyl" } }),
    ).toEqual([
      expect.objectContaining({ name: "Tarpaulin", quantity: "Quantity 2", specs: ["3x6 ft", "Vinyl"] }),
    ]);
  });

  it("reads a signature as signed and a tap as approved", () => {
    expect(approvalRecordView(RECORD)).toEqual(
      expect.objectContaining({ title: "Order approval", approved: true, statusLabel: "Signed", methodLabel: "Signed by hand" }),
    );
    expect(approvalRecordView({ phase: "checkout", status: "approved", method: "one_tap" })).toEqual(
      expect.objectContaining({ approved: true, statusLabel: "Approved", methodLabel: 'One tap: "I approve this order"' }),
    );
    expect(approvalRecordView({ phase: "sample", status: "approved", method: "drawn" })).toEqual(
      expect.objectContaining({ title: "Sample approval", methodLabel: "Signed by hand, with a photo of the sample" }),
    );
  });

  it("never reads a compatibility record as an approval", () => {
    const view = approvalRecordView({ phase: "checkout", status: "legacy_unrecorded", method: null });
    expect(view.approved).toBe(false);
    expect(view.statusLabel).toBe("No approval recorded");
    expect(view.body).toMatch(/no approval was collected/);
  });

  it("sums the record up in one line under the folded heading", () => {
    expect(approvalSummaryLine({ approvalProof: undefined })).toBeNull();
    expect(approvalSummaryLine({ approvalProof: { requirement: { version: 1, required: true, method: "drawn" }, records: [] } })).toBe(
      "Waiting for your approval",
    );
    expect(approvalSummaryLine({ approvalProof: { requirement: null, records: [] } })).toBe("No approval recorded");
    expect(approvalSummaryLine({ approvalProof: { requirement: null, records: [RECORD] } })).toBe("Signed 18 Oct");
    expect(
      approvalSummaryLine({ approvalProof: { requirement: null, records: [{ ...RECORD, status: "legacy_unrecorded", method: null }] } }),
    ).toBe("No approval recorded");
  });

  it("groups the fingerprint for reading", () => {
    expect(shortFingerprint("9f2c1a7be4d05c3388aa")).toBe("9F2C 1A7B E4D0 5C33");
  });
});

describe("approval times", () => {
  it("are said in Davao time", () => {
    expect(approvalTime("2026-10-18T06:30:00.000Z")).toBe("18 Oct 2026, 2:30 PM");
    expect(approvalTime(null)).toBe("Time not recorded");
  });
});
