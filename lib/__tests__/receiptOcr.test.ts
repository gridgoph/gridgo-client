import {
  extractPaymentReference,
  nextReferenceFromOcr,
  OCR_LOW_CONFIDENCE,
  OCR_UNREADABLE,
  referenceFromOcr,
} from "@/lib/receiptOcr";

const GCASH_RECEIPT = `
GCash
Send Money
Successful
Sep 4, 2026  2:14 PM
₱51.75
Ref. No. 1234567890123
`.trim();

const MAYA_RECEIPT = `
Maya
Transfer successful
Amount PHP 1,250.00
Reference No.
MYA9K2P4Q8R1
Apr 12, 2026
`.trim();

const INSTAPAY_RECEIPT = `
InstaPay Ref. No. 001234567890
Amount ₱200.00
12/08/2026
`.trim();

describe("extractPaymentReference", () => {
  it("reads a GCash Ref. No. and ignores the date and amount", () => {
    expect(extractPaymentReference(GCASH_RECEIPT)).toBe("1234567890123");
  });

  it("reads a Maya reference on the line after the label", () => {
    expect(extractPaymentReference(MAYA_RECEIPT)).toBe("MYA9K2P4Q8R1");
  });

  it("reads an InstaPay reference", () => {
    expect(extractPaymentReference(INSTAPAY_RECEIPT)).toBe("001234567890");
  });

  it("does not invent a number from leftover dates and amounts", () => {
    expect(extractPaymentReference("₱51.75\nSep 4, 2026\nPHP 1,250.00")).toBeNull();
    expect(extractPaymentReference("")).toBeNull();
    expect(extractPaymentReference("Ref. No.")).toBeNull();
  });

  it("ignores an 8-digit date that looks like a short token", () => {
    expect(extractPaymentReference("20260904")).toBeNull();
  });
});

describe("referenceFromOcr", () => {
  it("keeps a labelled GCash number", () => {
    expect(referenceFromOcr({ text: GCASH_RECEIPT, confidence: 80 })).toBe("1234567890123");
  });

  it("drops a short unlabeled token when confidence is low", () => {
    expect(
      referenceFromOcr({
        text: "ABC12DEF",
        confidence: OCR_LOW_CONFIDENCE - 1,
      }),
    ).toBeNull();
  });

  it("never invents a number from a null read", () => {
    expect(referenceFromOcr(null)).toBeNull();
  });
});

describe("nextReferenceFromOcr", () => {
  it("fills the field from a successful read", () => {
    expect(
      nextReferenceFromOcr("", { status: "filled", reference: "1234567890123" }),
    ).toBe("1234567890123");
  });

  it("clears the field when the number could not be read", () => {
    expect(
      nextReferenceFromOcr("old", { status: "unreadable", reference: null }),
    ).toBe("");
    expect(OCR_UNREADABLE).toMatch(/could not be read/i);
  });

  it("leaves the field alone while reading", () => {
    expect(
      nextReferenceFromOcr("typed", { status: "reading", reference: null }),
    ).toBe("typed");
  });
});
