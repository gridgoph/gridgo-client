import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ChangeRequestCard } from "@/components/orderChange/ChangeRequestCard";
import * as api from "@/lib/api";
import { changeRequestView } from "@/lib/orderChanges";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  answerOrderChange: jest.fn(),
  newIdempotencyKey: () => "key-1",
}));
jest.mock("@/components/QrTopUpForm", () => ({
  QrTopUpForm: ({ amountMinor, primary }: { amountMinor: number; primary: boolean }) => {
    const { Text: T } = jest.requireActual("react-native");
    return <T>{`top-up form ${amountMinor}${primary ? " (primary)" : ""}`}</T>;
  },
}));

const base: api.OrderChangeRequest = {
  id: "change_1",
  orderId: "ord_1",
  lineItemId: "line_1",
  status: "pending",
  version: 1,
  totalMinor: 11000,
  createdAt: "2026-10-15T02:00:00.000Z",
  reason: "Stapling on the left needs a separate finishing pass.",
  proposedSpec: "Staple on the left; same paper and print settings.",
  proposedPromiseBy: null,
  originalInstructions: "Staple on the left please",
};
const order = (change: api.OrderChangeRequest) =>
  ({
    id: "ord_1",
    state: "production",
    promiseBy: "2026-10-20T09:00:00.000Z",
    productionItems: [{ id: "line_1", itemName: "Brochures" }],
    changeRequests: [change],
  }) as unknown as api.Order;

beforeEach(() => jest.clearAllMocks());

it("lays out the change with the client's note, the shop's amendment and the cost", async () => {
  const current = order(base);
  await render(<ChangeRequestCard order={current} view={changeRequestView(current)!} primary onChanged={jest.fn()} />);
  expect(screen.getByText("The shop asks to change your order")).toBeTruthy();
  expect(screen.getByText(/A change to the item for Brochures\. Until you answer/)).toBeTruthy();
  expect(screen.getByText(base.reason)).toBeTruthy();
  expect(screen.getByLabelText(/Your note: Staple on the left please\. The shop proposes: Staple on the left; same paper/)).toBeTruthy();
  expect(screen.getByText("₱110.00 more")).toBeTruthy();
  expect(screen.getByText(/Vouchers and discounts do not apply/)).toBeTruthy();
  expect(screen.getByText("Approve the change")).toBeTruthy();
  expect(screen.getByText(/Next you pay ₱110.00 by QR/)).toBeTruthy();
  expect(screen.getByText("Decline")).toBeTruthy();
});

it("asks for the top-up once approved, keeping a way to decline", async () => {
  const current = order({ ...base, status: "pending_payment", version: 2 });
  await render(<ChangeRequestCard order={current} view={changeRequestView(current)!} primary onChanged={jest.fn()} />);
  expect(screen.getByText("Pay ₱110.00 for your change")).toBeTruthy();
  expect(screen.getByText("Approved · not paid yet")).toBeTruthy();
  expect(screen.getByText("top-up form 11000 (primary)")).toBeTruthy();
  expect(screen.getByText("Decline and keep my order as placed")).toBeTruthy();
  expect(screen.queryByText("Approve the change")).toBeNull();
});

it("says the transfer is with Operations and asks nothing", async () => {
  const current = order({
    ...base,
    status: "pending_confirmation",
    version: 3,
    payment: { proofFileId: "file_1", reference: "WALLET-123", submittedAt: "2026-10-15T04:00:00.000Z" },
  });
  await render(<ChangeRequestCard order={current} view={changeRequestView(current)!} primary={false} onChanged={jest.fn()} />);
  expect(screen.getByText("We are checking your payment for the change")).toBeTruthy();
  expect(screen.getByText("WALLET-123")).toBeTruthy();
  expect(screen.getByText(/Do not pay again/)).toBeTruthy();
  expect(screen.queryByText(/top-up form/)).toBeNull();
  expect(screen.queryByText("Decline")).toBeNull();
});

it("draws a time-only change as a date moving, at no extra cost", async () => {
  const current = order({ ...base, proposedSpec: "", totalMinor: 0, proposedPromiseBy: "2026-10-22T09:00:00.000Z" });
  await render(<ChangeRequestCard order={current} view={changeRequestView(current)!} primary onChanged={jest.fn()} />);
  expect(screen.getByText(/A new ready date for Brochures/)).toBeTruthy();
  expect(screen.getByText("No extra cost")).toBeTruthy();
  expect(screen.getByLabelText(/Ready by, with the change/)).toBeTruthy();
  expect(screen.queryByText(/The shop proposes/)).toBeNull();
});

// One press per file under RNTL 14 + React 19: this test goes last.
it("approves with the request's version and an idempotency key, then re-reads the order", async () => {
  const onChanged = jest.fn();
  (api.answerOrderChange as jest.Mock).mockResolvedValue({ ...base, status: "pending_payment", version: 2 });
  const current = order(base);
  await render(<ChangeRequestCard order={current} view={changeRequestView(current)!} primary onChanged={onChanged} />);
  fireEvent.press(screen.getByText("Approve the change"));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(api.answerOrderChange).toHaveBeenCalledWith("ord_1", "change_1", { expectedVersion: 1, answer: "accept" }, "key-1");
});
