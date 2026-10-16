import { render, screen } from "@testing-library/react-native";

import { ProofDecision } from "@/components/ProofDecision";
import type { ArtworkGuidance, Order } from "@/lib/api";

/**
 * gridgo-client#242: the proof screen shows the print check recorded with the
 * order at checkout — each warning, and whether the client accepted it.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

const RECORD: ArtworkGuidance = {
  subcategoryCode: "tarpaulins_outdoor_banners",
  minimumDpi: 100,
  acceptsRgb: false,
  expectedColorMode: "cmyk",
  orderedSize: { widthMilli: 914_400, heightMilli: 1_828_800 },
  files: [
    {
      fileId: "file_banner",
      colorMode: "rgb",
      pixelWidth: 1200,
      pixelHeight: 2400,
      effectiveDpi: 33,
      warnings: [
        { code: "low_resolution", effectiveDpi: 33, minimumDpi: 100, acceptedAt: "2026-10-16T07:42:00.000Z" },
        { code: "color_mode", colorMode: "rgb", expectedColorMode: "cmyk", acceptedAt: null },
      ],
    },
  ],
  openWarningCount: 1,
  version: 1,
  evaluatedAt: "2026-10-16T07:45:00.000Z",
};

function order(record: ArtworkGuidance | null): Order {
  return {
    id: "ord_1",
    state: "proof_approval",
    title: "Store tarpaulin",
    quantity: 1,
    size: "3 x 6 ft",
    deadline: "2026-10-30T09:00:00.000Z",
    artworkFileIds: ["file_banner"],
    priceRange: null,
    productionItems: [
      {
        id: "item_1",
        itemName: "Tarpaulin",
        quantity: 1,
        pricingUnit: "per_area",
        packageQty: null,
        measurement: null,
        structuredSpec: {},
        options: [],
        artworkFileId: "file_banner",
        mockupFileId: null,
        artworkGuidance: record,
      },
    ],
  } as unknown as Order;
}

const props = { family: null, unit: "pcs", materialLabel: "Tarpaulin", finishLabel: null, onUpdated: jest.fn() };

it("shows each recorded warning and whether it was accepted", async () => {
  await render(<ProofDecision order={order(RECORD)} {...props} />);

  expect(screen.getByText("Print check")).toBeTruthy();
  expect(screen.getByText("Colour: RGB. Resolution: 33 DPI at the size ordered, 100 recommended")).toBeTruthy();
  expect(screen.getByLabelText("Lower resolution than recommended. Accepted 16 Oct, 3:42 PM.")).toBeTruthy();
  expect(screen.getByLabelText("RGB file. Not accepted.")).toBeTruthy();
  expect(screen.getByText(/not covered by the free reprint promise/)).toBeTruthy();
});

it("says nothing on an order from before the record", async () => {
  await render(<ProofDecision order={order(null)} {...props} />);

  expect(screen.queryByText("Print check")).toBeNull();
});
