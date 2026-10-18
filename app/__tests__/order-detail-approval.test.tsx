import { screen } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import type { OrderApprovalProof } from "@/lib/api";
import { ORDER_SECTIONS_FOLDED, useOrderSections } from "@/store/orderSections";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";

/*
  The approval record on the order screen (gridgo-client#248): a folded
  section saying what was recorded, open onto each record, the full record
  and the PDF. Rendering only — the fold state is preset, never pressed.
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

const SIGNED: OrderApprovalProof = {
  requirement: { version: 1, required: false, method: "drawn" },
  records: [
    { id: "apr_1", phase: "checkout", status: "approved", method: "drawn", at: "2026-10-18T06:30:00.000Z", snapshotSha256: "abc" },
  ],
  readUrl: "/orders/ord_refund_1/approval-proof",
  downloadUrl: "/orders/ord_refund_1/approval-proof/download",
};

const UNRECORDED: OrderApprovalProof = {
  requirement: { version: 1, required: false, method: "one_tap" },
  records: [
    { id: "apr_2", phase: "checkout", status: "legacy_unrecorded", method: null, at: "2026-10-18T06:30:00.000Z", snapshotSha256: "def" },
  ],
};

function show(approvalProof: OrderApprovalProof | undefined) {
  api.listOrderRefunds.mockResolvedValue([]);
  api.getOrder.mockResolvedValue(refundOrder({ approvalProof }));
  return renderScreen(<OrderDetailScreen />);
}

function heading() {
  return screen.getByRole("button", { name: /^Approval record\. / });
}

beforeEach(() => {
  useOrderSections.setState({ open: ORDER_SECTIONS_FOLDED });
});

it("folds the approval record under a line saying it was signed", async () => {
  await show(SIGNED);
  expect(await screen.findByText("Signed 18 Oct")).toBeTruthy();
  expect(heading().props.accessibilityState).toMatchObject({ expanded: false });
  expect(screen.queryByText("Download PDF")).toBeNull();
});

it("opens onto each record, the full record and the PDF", async () => {
  useOrderSections.setState({ open: { ...ORDER_SECTIONS_FOLDED, approval: true } });
  await show(SIGNED);
  expect(await screen.findByText("Order approval")).toBeTruthy();
  expect(screen.getByText("Signed")).toBeTruthy();
  expect(screen.getByText("Signed by hand · 18 Oct 2026, 2:30 PM")).toBeTruthy();
  expect(screen.getByRole("button", { name: "View the approval record" })).toBeTruthy();
  expect(screen.getByText("What you approved, with your signature or tap.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Download the approval record as a PDF" })).toBeTruthy();
});

it("never reads an order placed without an approval as approved", async () => {
  useOrderSections.setState({ open: { ...ORDER_SECTIONS_FOLDED, approval: true } });
  await show(UNRECORDED);
  expect((await screen.findAllByText("No approval recorded")).length).toBe(2);
  expect(screen.queryByText("Signed")).toBeNull();
  expect(screen.queryByText("Approved")).toBeNull();
  expect(screen.getByText("What GRIDGO kept when this order was placed.")).toBeTruthy();
  expect(screen.queryByText("What you approved, with your signature or tap.")).toBeNull();
});

it("draws no approval section on an API from before approval records", async () => {
  await show(undefined);
  expect(await screen.findByRole("button", { name: /^Payment details\. / })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Approval record\. / })).toBeNull();
});
