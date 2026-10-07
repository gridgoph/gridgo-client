import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { DropoffConfirmationCard } from "@/components/DropoffConfirmationCard";
import * as api from "@/lib/api";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  answerDropoffConfirmation: jest.fn(),
}));
jest.mock("@/components/DropoffLocator", () => ({ DropoffLocator: () => null }));
jest.mock("@/components/DropoffDetails", () => ({ DropoffDetails: () => null }));
const newPoint = { lat: 7.07, lng: 125.61, label: "New meeting point" };
jest.mock("@/hooks/useDropoffEditor", () => ({ useDropoffEditor: () => ({
  loadSaved: jest.fn(), setTouched: jest.fn(), ready: true,
  point: { lat: 7.07, lng: 125.61 }, addressLine: "New meeting point",
}) }));
const pending = { status: "pending", requestedAt: "2026-10-07T10:00:00Z" } as const;
const order = {
  id: "order-dropoff", state: "out_for_delivery", fulfillmentMode: "delivery",
  dropoff: { lat: 7.06, lng: 125.6, label: "Original meeting point" }, dropoffConfirmation: pending,
} as api.Order;
const confirmed: api.DropoffConfirmation = { ...pending, status: "confirmed", answeredAt: pending.requestedAt, point: newPoint };

beforeEach(() => jest.clearAllMocks());

it("confirms the original pin and uses the server-confirmed point", async () => {
  const onUpdated = jest.fn();
  jest.mocked(api.answerDropoffConfirmation).mockResolvedValue(confirmed);
  await render(<DropoffConfirmationCard order={order} onUpdated={onUpdated} onRefresh={jest.fn()} />);
  await fireEvent.press(screen.getByText("Yes, deliver here"));
  await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...order, dropoff: newPoint, dropoffConfirmation: confirmed }));
  expect(api.answerDropoffConfirmation).toHaveBeenCalledWith(order.id, { action: "confirm" });
});

it("sends a changed pin and adopts it only after the server accepts it", async () => {
  const onUpdated = jest.fn();
  jest.mocked(api.answerDropoffConfirmation).mockResolvedValue(confirmed);
  await render(<DropoffConfirmationCard order={order} onUpdated={onUpdated} onRefresh={jest.fn()} />);
  await fireEvent.press(screen.getByText("Change the pin"));
  expect(onUpdated).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Send this drop-off"));
  await waitFor(() => expect(api.answerDropoffConfirmation).toHaveBeenCalledWith(order.id, { action: "change", point: newPoint }));
  expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ dropoff: newPoint }));
});

it("keeps the original destination when a fee-changing request needs review", async () => {
  const review: api.DropoffConfirmation = { ...pending, status: "needs_review", answeredAt: pending.requestedAt, requestedPoint: newPoint };
  const onUpdated = jest.fn();
  jest.mocked(api.answerDropoffConfirmation).mockResolvedValue(review);
  const view = await render(<DropoffConfirmationCard order={order} onUpdated={onUpdated} onRefresh={jest.fn()} />);
  await fireEvent.press(screen.getByText("Change the pin"));
  await fireEvent.press(screen.getByText("Send this drop-off"));
  await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...order, dropoffConfirmation: review }));
  await view.rerender(<DropoffConfirmationCard order={{ ...order, dropoffConfirmation: review }} onUpdated={onUpdated} onRefresh={jest.fn()} />);
  expect(screen.getByText("GRIDGO will contact you")).toBeTruthy();
  expect(screen.getByText(/Your original drop-off and payment are unchanged/)).toBeTruthy();
  expect(screen.queryByText("Yes, deliver here")).toBeNull();
});

it("preserves the prompt and offers retry after a network failure", async () => {
  const onUpdated = jest.fn();
  jest.mocked(api.answerDropoffConfirmation).mockRejectedValue(new Error("offline"));
  await render(<DropoffConfirmationCard order={order} onUpdated={onUpdated} onRefresh={jest.fn()} />);
  await fireEvent.press(screen.getByText("Yes, deliver here"));
  await waitFor(() => expect(screen.getByText("Not confirmed")).toBeTruthy());
  expect(onUpdated).not.toHaveBeenCalled();
  expect(screen.getByText("Yes, deliver here")).toBeTruthy();
});

it.each([
  { dropoffConfirmation: undefined }, { fulfillmentMode: "pickup" as const }, { state: "completed" },
])("does not prompt legacy, pickup or closed orders: %j", async (patch) => {
  await render(<DropoffConfirmationCard order={{ ...order, ...patch }} onUpdated={jest.fn()} onRefresh={jest.fn()} />);
  expect(screen.queryByText("Is this still your drop-off?")).toBeNull();
});

it("renders a saved confirmation after reopening without asking again", async () => {
  await render(<DropoffConfirmationCard order={{ ...order, dropoffConfirmation: confirmed }} onUpdated={jest.fn()} onRefresh={jest.fn()} />);
  expect(screen.getByText("Drop-off confirmed")).toBeTruthy();
  expect(screen.getByText(newPoint.label)).toBeTruthy();
  expect(screen.queryByText("Yes, deliver here")).toBeNull();
});

it("refreshes a stale prompt after the API says it was already answered", async () => {
  const onRefresh = jest.fn();
  jest.mocked(api.answerDropoffConfirmation).mockRejectedValue(new api.ApiError(409, { error: "dropoff_confirmation_answered" }));
  await render(<DropoffConfirmationCard order={order} onUpdated={jest.fn()} onRefresh={onRefresh} />);
  await fireEvent.press(screen.getByText("Yes, deliver here"));
  await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  expect(screen.getByText(/This drop-off was already answered/)).toBeTruthy();
});

it("cannot send two answers while the first one is in flight", async () => {
  let resolve!: (value: api.DropoffConfirmation) => void;
  jest.mocked(api.answerDropoffConfirmation).mockReturnValue(new Promise((done) => { resolve = done; }));
  await render(<DropoffConfirmationCard order={order} onUpdated={jest.fn()} onRefresh={jest.fn()} />);
  await fireEvent.press(screen.getByText("Yes, deliver here"));
  await fireEvent.press(screen.getByText("Sending…"));
  expect(api.answerDropoffConfirmation).toHaveBeenCalledTimes(1);
  resolve(confirmed);
  await waitFor(() => expect(screen.queryByText("Sending…")).toBeNull());
});
