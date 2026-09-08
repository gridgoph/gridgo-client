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

  it("reads a GCash Bankard biller reference, not BancNet or the card number", () => {
    const bankard = `
RCBC Credit (Bankard)
Paid via GCash
Credit Card Number 5179681308604108
GCash Reference No. 965373469
BancNet Reference No. 003999
Sep 8, 2026 8:14 AM
Total 780.00
`.trim();
    expect(extractPaymentReference(bankard)).toBe("965373469");
  });

  it("reads a GCash biller number when OCR stacks labels then numbers", () => {
    const stacked = `
GCash Reference No.
BancNet Reference No.
965373469
003999
Sep 8, 2026
`.trim();
    expect(extractPaymentReference(stacked)).toBe("965373469");
  });

  it("does not treat a 16-digit card PAN as the wallet reference", () => {
    expect(
      extractPaymentReference("Paid via GCash\n5179681308604108\nSep 8, 2026"),
    ).toBeNull();
  });

  it("reads a GCash send-money Ref No. and ignores the phone number", () => {
    const sent = `
HA..H AL..A U.
+63 975 942 4438
Sent via GCash
Amount 1,000.00
Total Amount Sent ₱1000.00
Ref No. 9044838604781
Sep 8, 2026 9:48 PM
`.trim();
    expect(extractPaymentReference(sent)).toBe("9044838604781");
  });

  it("reads real Android OCR with the biller's copy icon beside the number", () => {
    expect(extractPaymentReference(
      "GCash Reference No. 965373469 0)\nBancNet Reference No, 003999 0",
    )).toBe("965373469");
  });

  it("keeps a send reference separate from a date on the same OCR line", () => {
    expect(extractPaymentReference(
      "Ref No. 9044838604781 Sep 8, 2026 9:48 PM",
    )).toBe("9044838604781");
  });

  it("does not treat a +63 mobile as the wallet reference", () => {
    expect(
      extractPaymentReference("Sent via GCash\n+63 975 942 4438\nSep 8, 2026"),
    ).toBeNull();
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
