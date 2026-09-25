import { PHYSICAL_INVOICE_REQUESTS_ENABLED } from "@/constants/features";
import {
  EMPTY_PHYSICAL_INVOICE,
  firstPhysicalInvoiceError,
  physicalInvoiceEntry,
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

describe("physical invoice entry point", () => {
  const filed = {
    orderId: "ord_1",
    contactPerson: "Ana Reyes",
    officeAddress: "12 Laurel",
    operatingHours: "9–5",
    requestedAt: "2026-09-20T02:00:00.000Z",
  };

  it("is switched off for the pilot (gridgoph/gridgo-web#61)", () => {
    expect(PHYSICAL_INVOICE_REQUESTS_ENABLED).toBe(false);
  });

  it("offers no request while the switch is off", () => {
    expect(physicalInvoiceEntry({})).toBeNull();
    expect(physicalInvoiceEntry({ physicalInvoiceRequest: null }, false)).toBeNull();
  });

  it("still lets an order that already has a request view it", () => {
    expect(physicalInvoiceEntry({ physicalInvoiceRequest: filed }, false)).toEqual({
      kind: "view",
      label: "View physical invoice request",
    });
  });

  it("comes back as a request when the switch is on", () => {
    expect(physicalInvoiceEntry({}, true)).toEqual({
      kind: "request",
      label: "Request a physical invoice",
    });
    expect(physicalInvoiceEntry({ physicalInvoiceRequest: filed }, true)?.kind).toBe("view");
  });

  it("offers nothing before the order has loaded", () => {
    expect(physicalInvoiceEntry(null, true)).toBeNull();
  });
});
