import { render, screen } from "@testing-library/react-native";

import { ProofDecision } from "@/components/ProofDecision";
import type { Order } from "@/lib/api";

/**
 * gridgo-client#249: the artwork proof shows the exact colours agreed at
 * checkout beside the colours GRIDGO read from each file.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFile: jest.fn().mockRejectedValue(new Error("offline")),
}));

function order(withColours: boolean): Order {
  return {
    id: "ord_1",
    state: "proof_approval",
    title: "School shirts",
    quantity: 1,
    size: "A5",
    deadline: "2026-10-30T09:00:00.000Z",
    artworkFileIds: ["file_png"],
    priceRange: null,
    productionItems: [
      {
        id: "item_1",
        itemName: "Shirts",
        quantity: 1,
        pricingUnit: null,
        packageQty: null,
        measurement: null,
        structuredSpec: {},
        options: [],
        artworkFileId: "file_png",
        mockupFileId: null,
        artworkAttachments: [{ kind: "file", fileId: "file_png", label: "Front" }],
        colorTargets: withColours
          ? [
              { label: "School maroon", format: "pantone", value: "PANTONE 201 C", cmyk: null, hex: null, swatchHex: "#9D2235", swatchApproximate: true },
              { label: "Logo blue", format: "hex", value: "#1A5FB4", cmyk: null, hex: "#1A5FB4", swatchHex: "#1A5FB4", swatchApproximate: false },
            ]
          : [],
        artworkColors: [
          {
            fileId: "file_png",
            colors: {
              version: 1,
              status: "read",
              reasons: [],
              colors: [{ kind: "pixels", name: null, space: "rgb", cmyk: null, hex: "#1A5FB4", uses: null, shareBps: 2500 }],
            },
          },
        ],
      },
    ],
  } as unknown as Order;
}

const props = { family: null, unit: "pcs", materialLabel: "Cotton", finishLabel: null, onUpdated: jest.fn() };

it("shows the agreed colours beside the colours read from the file", async () => {
  await render(<ProofDecision order={order(true)} {...props} />);
  expect(screen.getByText("Exact colours")).toBeTruthy();
  expect(screen.getByLabelText("School maroon. PANTONE 201 C. Your approximate swatch")).toBeTruthy();
  expect(screen.getByLabelText("Logo blue. #1A5FB4. Screen colour. In Front")).toBeTruthy();
  expect(screen.getByLabelText("#1A5FB4, 25% of the image")).toBeTruthy();
  expect(screen.getByText(/Screens and printers show colour differently/)).toBeTruthy();
});

it("draws nothing for an order that named no colours", async () => {
  await render(<ProofDecision order={order(false)} {...props} />);
  expect(screen.queryByText("Exact colours")).toBeNull();
});
