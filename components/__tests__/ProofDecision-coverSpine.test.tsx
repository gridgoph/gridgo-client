import { render, screen } from "@testing-library/react-native";

import { CoverSpineRecord } from "@/components/CoverSpineRecord";
import { ProofDecision } from "@/components/ProofDecision";
import type { CoverSpineRecord as Record, Order, ProductionItem } from "@/lib/api";
import { useArtworkAttachments } from "@/store/artworkAttachments";

/**
 * gridgo-client#247: the order and its artwork proof show the cover and
 * spine agreed at checkout.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFile: jest.fn().mockRejectedValue(new Error("offline")),
}));

const GIVEN: Record = {
  status: "given",
  cover: "separate_file",
  coverFileId: "file_cover",
  spine: { institutionCode: "ABC-CS", title: "Flood Risk Mapping", author: "Sample Author", month: 10, year: 2026 },
  spineDate: "October 2026",
  spineSummary: "ABC-CS | Flood Risk Mapping | Sample Author | October 2026",
};

function item(coverSpine: Record | null | undefined, overrides: Partial<ProductionItem> = {}): ProductionItem {
  return {
    id: "item_1",
    itemName: "Hardbound thesis",
    quantity: 3,
    pricingUnit: "per_page",
    packageQty: null,
    measurement: { pages: 80 },
    structuredSpec: {},
    options: [],
    artworkFileId: "file_book",
    mockupFileId: null,
    artworkAttachments: [{ kind: "file", fileId: "file_book" }, { kind: "file", fileId: "file_cover", label: "Cover" }],
    coverSpine,
    ...overrides,
  };
}

function order(items: ProductionItem[]): Order {
  return {
    id: "ord_1",
    state: "proof_approval",
    title: "Hardbound thesis",
    quantity: 3,
    size: "A4",
    deadline: "2026-10-30T09:00:00.000Z",
    artworkFileIds: ["file_book"],
    priceRange: null,
    productionItems: items,
  } as unknown as Order;
}

const props = { family: null, unit: "copies", materialLabel: "Bond", finishLabel: null, onUpdated: jest.fn() };

it("shows the agreed cover and spine on the proof, with the book drawn", async () => {
  useArtworkAttachments.setState({
    files: { file_cover: { fileId: "file_cover", originalFilename: "cover-final.pdf" } as never },
  });
  await render(<ProofDecision order={order([item(GIVEN)])} {...props} />);

  expect(screen.getByText("Cover and spine")).toBeTruthy();
  expect(screen.getByText("Separate cover page")).toBeTruthy();
  expect(screen.getByText("ABC-CS | Flood Risk Mapping | Sample Author | October 2026")).toBeTruthy();
  expect(
    screen.getByLabelText(
      "Preview of the spine, top to bottom: ABC-CS, Flood Risk Mapping, Sample Author, October 2026. Front cover printed from cover-final.pdf.",
    ),
  ).toBeTruthy();
});

it("says Not given when the book was ordered without the form", async () => {
  await render(<CoverSpineRecord items={[item({ status: "not_given", cover: null, coverFileId: null, spine: null, spineDate: null, spineSummary: null })]} bare />);

  expect(screen.getByText("Cover and spine")).toBeTruthy();
  expect(screen.getByText("Not given")).toBeTruthy();
  expect(screen.queryByLabelText(/Preview of the spine/)).toBeNull();
});

it("draws nothing for an order without a hardbound item", async () => {
  await render(<ProofDecision order={order([item(null), item(undefined, { id: "item_2" })])} {...props} />);

  expect(screen.queryByText("Cover and spine")).toBeNull();
  expect(screen.queryByLabelText(/Preview of the spine/)).toBeNull();
});
