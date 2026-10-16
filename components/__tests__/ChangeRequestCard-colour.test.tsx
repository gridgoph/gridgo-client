import { render, screen } from "@testing-library/react-native";

import { ChangeRequestCard } from "@/components/orderChange/ChangeRequestCard";
import type * as api from "@/lib/api";
import { changeRequestView } from "@/lib/orderChanges";

jest.mock("@/components/QrTopUpForm", () => ({ QrTopUpForm: () => null }));

const change: api.OrderChangeRequest = {
  id: "change_1",
  orderId: "ord_1",
  lineItemId: "line_1",
  status: "pending",
  version: 1,
  totalMinor: 11600,
  createdAt: "2026-10-15T02:00:00.000Z",
  reason: "Page 2 has substantial orange fill when inspected at print size",
  proposedSpec: null,
  proposedPromiseBy: null,
  colourCorrection: {
    quantity: 2,
    quantityMode: "copies_each_page",
    totalSheets: 4,
    originalClientLineSubtotalMinor: 26100,
    correctedClientLineSubtotalMinor: 37700,
    pages: [
      { fileId: "file_pdf", page: 1, strongColourBps: 0, tier: "none", sheetPriceMinor: 4350 },
      { fileId: "file_pdf", page: 2, strongColourBps: 3000, tier: "up_to_50", sheetPriceMinor: 14500 },
    ],
  },
};

const order = {
  id: "ord_1",
  state: "production",
  productionItems: [
    {
      id: "line_1",
      itemName: "Whiteprint plans",
      colourPricing: {
        version: 1, status: "priced", pricedByColour: true, quantityMode: "copies_each_page", quantity: 2, totalSheets: 4,
        tierSet: "large_format", warning: null, clientLineSubtotalMinor: 26100,
        pages: [
          { fileId: "file_pdf", page: 1, strongColourBps: 0, tier: "none", sheetPriceMinor: 4350 },
          { fileId: "file_pdf", page: 2, strongColourBps: 1800, tier: "up_to_25", sheetPriceMinor: 8700 },
        ],
      },
    },
  ],
  changeRequests: [change],
} as unknown as api.Order;

it("shows each corrected page beside what was ordered, and the corrected all-in price", async () => {
  await render(<ChangeRequestCard order={order} view={changeRequestView(order)!} primary onChanged={jest.fn()} />);
  expect(screen.getByText(/A corrected colour price for Whiteprint plans/)).toBeTruthy();
  expect(screen.getByLabelText("Page 2: 30% strong colour, ₱145.00 a sheet. Was 18%, ₱87.00.")).toBeTruthy();
  expect(screen.getByLabelText("Page 1: 0% strong colour, ₱43.50 a sheet. Unchanged.")).toBeTruthy();
  expect(screen.getByLabelText("Printing for this item: ₱261.00 before, ₱377.00 with the correction")).toBeTruthy();
  expect(screen.getByText("₱116.00 more")).toBeTruthy();
  expect(screen.getByText("Approve the change")).toBeTruthy();
});
