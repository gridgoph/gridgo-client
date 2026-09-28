import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import type { ProductionItem } from "@/lib/api";
import { ORDER_SECTIONS_FOLDED, useOrderSections } from "@/store/orderSections";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";

/*
  The order screen's shape (gridgo-client#129): the latest progress leads and
  opens the history; Specifications, Artwork and references, and Payment
  details fold. One press per test — see AGENTS.md on this test stack.
*/

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "ord_refund_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/lib/api", () => require("@/test/orderScreenMocks").orderScreenApiMock());

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const flyers: ProductionItem = {
  id: "line_1",
  itemName: "Grand opening flyers",
  quantity: 200,
  pricingUnit: null,
  packageQty: null,
  measurement: null,
  structuredSpec: { size: "A5", material: "matte" },
  options: [],
  artworkFileId: "file_art",
  mockupFileId: null,
  artworkLinks: [{ formatCode: "canva_link", url: "https://www.canva.com/design/DAFlyer/view" }],
};

beforeEach(() => {
  useOrderSections.setState({ open: ORDER_SECTIONS_FOLDED });
  api.listOrderRefunds.mockResolvedValue([]);
  api.getOrder.mockResolvedValue(
    refundOrder({
      timeline: [
        { at: "2026-09-26T08:00:00+08:00", state: "needs_qa", note: "Checking your artwork" },
        { at: "2026-09-27T08:00:00+08:00", state: "production", note: "Printing your order" },
      ],
      productionProgress: { status: "waiting_for_photo", photos: [] },
      productionItems: [flyers],
    }),
  );
  api.getFile.mockResolvedValue({
    fileId: "file_art",
    purpose: "artwork",
    originalFilename: "flyer-front.pdf",
    declaredContentType: "application/pdf",
    detectedContentType: "application/pdf",
    size: 2_202_009,
    ownerId: "user_client",
    state: "ready",
    createdAt: "2026-09-26T08:00:00+08:00",
    readyAt: "2026-09-26T08:00:00+08:00",
    references: [{ type: "order", id: "ord_refund_1", field: "line:line_1:artwork" }],
  });
});

function sectionButton(title: string) {
  return screen.getByRole("button", { name: new RegExp(`^${title}\\. `) });
}

it("leads with the latest progress and folds the record, each heading saying what it holds", async () => {
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Printing your order")).toBeTruthy();
  expect(screen.getByText("Full history")).toBeTruthy();
  expect(screen.getByText("Waiting for a progress photo")).toBeTruthy();
  const docket = screen.getByRole("button", { name: /^Latest progress\./ });
  expect(docket.props.accessibilityState).toMatchObject({ expanded: false });
  // The earlier step waits in the history.
  expect(screen.queryByText("Checking your artwork")).toBeNull();

  for (const title of ["Specifications", "Artwork and references", "Payment details"]) {
    expect(sectionButton(title).props.accessibilityState).toMatchObject({ expanded: false });
  }
  expect(screen.getByText(/^Quantity 200 · Due (5 Oct|Oct 5)$/)).toBeTruthy();
  expect(screen.getByText("1 file · 1 design link")).toBeTruthy();
  expect(screen.getByText("Total ₱1,150.00")).toBeTruthy();
  // Folded means folded: no breakdown, no rows, no files behind the headings.
  expect(screen.queryByText("Deadline")).toBeNull();
  expect(screen.queryByText("View receipt")).toBeNull();
  expect(screen.queryByText("flyer-front.pdf")).toBeNull();
  expect(api.getFile).not.toHaveBeenCalled();
});

it("keeps what a client already opened when they come back to an order", async () => {
  useOrderSections.setState({
    open: { ...ORDER_SECTIONS_FOLDED, specifications: true, payment: true },
  });
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Deadline")).toBeTruthy();
  expect(screen.getByText("View receipt")).toBeTruthy();
  expect(sectionButton("Specifications").props.accessibilityState).toMatchObject({ expanded: true });
  expect(sectionButton("Artwork and references").props.accessibilityState).toMatchObject({
    expanded: false,
  });
});

it("opens the full history, with each step from the request to now", async () => {
  await renderScreen(<OrderDetailScreen />);
  await screen.findByText("Printing your order");

  fireEvent.press(screen.getByRole("button", { name: /^Latest progress\./ }));

  expect(await screen.findByText("Checking your artwork")).toBeTruthy();
  expect(screen.getByText("Hide full history")).toBeTruthy();
  expect(screen.getByText(/not packed without one/)).toBeTruthy();
  expect(useOrderSections.getState().open.history).toBe(true);
});

it("opens Specifications with the details, the deadline and where it goes", async () => {
  await renderScreen(<OrderDetailScreen />);
  await screen.findByText("Printing your order");

  fireEvent.press(sectionButton("Specifications"));

  expect(await screen.findByText("Deadline")).toBeTruthy();
  expect(screen.getByText("Quantity")).toBeTruthy();
  expect(screen.getByText("Deliver to")).toBeTruthy();
  expect(sectionButton("Specifications").props.accessibilityState).toMatchObject({ expanded: true });
  expect(useOrderSections.getState().open.specifications).toBe(true);
  // Design links are artwork, listed there rather than in the specification.
  expect(screen.queryByText("Canva link")).toBeNull();
});

it("opens Artwork and references with each file's type and size, and the design link", async () => {
  await renderScreen(<OrderDetailScreen />);
  await screen.findByText("Printing your order");

  fireEvent.press(sectionButton("Artwork and references"));

  expect(await screen.findByText("flyer-front.pdf")).toBeTruthy();
  expect(screen.getByText("Artwork · PDF · 2.1 MB")).toBeTruthy();
  expect(screen.getByLabelText(/^Open flyer-front\.pdf/)).toBeTruthy();
  expect(screen.getByText("Canva link")).toBeTruthy();
  await waitFor(() => expect(api.getFile).toHaveBeenCalledWith("file_art"));
});

it("opens Payment details with the breakdown and the total, and GRIDGO's cut in no peso figure", async () => {
  await renderScreen(<OrderDetailScreen />);
  await screen.findByText("Printing your order");

  fireEvent.press(sectionButton("Payment details"));

  expect(await screen.findByText("Printing")).toBeTruthy();
  expect(screen.getByText("₱1,100.00")).toBeTruthy();
  expect(screen.getByText("₱50.00")).toBeTruthy();
  expect(screen.getByText("Total")).toBeTruthy();
  // Paid in full up front: the total and the one payment are the same figure.
  expect(screen.getAllByText("₱1,150.00")).toHaveLength(2);
  expect(screen.getByText("Service fee · 10%")).toBeTruthy();
  expect(screen.queryByText("₱100.00")).toBeNull();
  expect(screen.queryByText("₱1,000.00")).toBeNull();
  expect(screen.getByText("View receipt")).toBeTruthy();
});
