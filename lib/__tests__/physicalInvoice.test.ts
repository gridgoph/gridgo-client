import {
  EMPTY_PHYSICAL_INVOICE,
  firstPhysicalInvoiceError,
  physicalInvoiceReady,
  trimPhysicalInvoice,
} from "@/lib/physicalInvoice";

describe("physical invoice request", () => {
  it("needs a contact, an office, and when someone is there", () => {
    expect(physicalInvoiceReady(EMPTY_PHYSICAL_INVOICE)).toBe(false);
    expect(firstPhysicalInvoiceError(EMPTY_PHYSICAL_INVOICE)?.field).toBe("contactPerson");
    expect(
      physicalInvoiceReady({
        contactPerson: "Ana Reyes",
        officeAddress: "7th floor, 12 J.P. Laurel Ave, Davao City",
        operatingHours: "Mon–Fri 9am–5pm",
      }),
    ).toBe(true);
  });

  it("trims what the client typed before sending", () => {
    expect(
      trimPhysicalInvoice({
        contactPerson: "  Ana  ",
        officeAddress: " 12 Laurel ",
        operatingHours: " 9–5 ",
      }),
    ).toEqual({
      contactPerson: "Ana",
      officeAddress: "12 Laurel",
      operatingHours: "9–5",
    });
  });
});
