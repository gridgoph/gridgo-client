import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { DeliveryPinCard } from "@/components/deliveryPin/DeliveryPinCard";
import * as api from "@/lib/api";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  confirmDeliveryPin: jest.fn(),
  newIdempotencyKey: () => "key-1",
}));
jest.mock("@/components/DeliveryMap", () => ({ DeliveryMap: () => null }));
jest.mock("@/components/deliveryPin/PinPaymentForm", () => ({
  PinPaymentForm: ({ primary }: { primary: boolean }) => {
    const { Text: T } = jest.requireActual("react-native");
    return <T>{primary ? "payment form (primary)" : "payment form"}</T>;
  },
}));

const point = { lat: 7.07, lng: 125.61, label: "12 Quimpo Blvd, Davao City" };
const basePin: api.DeliveryPin = {
  version: 3,
  status: "pending",
  requestedAt: "2026-10-15T02:00:00.000Z",
  confirmedAt: null,
  point,
  zone: "away",
  notes: "",
  receiverName: "",
  changeUsed: false,
  canConfirm: true,
  canChange: true,
  original: point,
  change: null,
};
const order = (deliveryPin: api.DeliveryPin) =>
  ({ id: "ord_1", state: "ready_for_dispatch", fulfillmentMode: "delivery", deliveryPin }) as api.Order;
const props = { primary: true, onChangePin: jest.fn(), onUpdated: jest.fn(), onRefresh: jest.fn() };

beforeEach(() => jest.clearAllMocks());

it("asks whether the client will be at the pin, with the one change on offer", async () => {
  await render(<DeliveryPinCard order={order(basePin)} {...props} />);
  expect(screen.getByText("Will you be at this pin?")).toBeTruthy();
  expect(screen.getByText(point.label)).toBeTruthy();
  expect(screen.getByText("Away")).toBeTruthy();
  expect(screen.getByText("You receive it")).toBeTruthy();
  expect(screen.getByText("Yes, I'll be here")).toBeTruthy();
  expect(screen.getByText("Change pin")).toBeTruthy();
  expect(screen.getByText("You can change this pin once, until a rider is assigned.")).toBeTruthy();
});

it("offers no change once a rider is assigned, but still takes the confirmation", async () => {
  await render(<DeliveryPinCard order={order({ ...basePin, canChange: false })} {...props} />);
  expect(screen.getByText("Yes, I'll be here")).toBeTruthy();
  expect(screen.queryByText("Change pin")).toBeNull();
  expect(screen.getByText(/A rider is assigned, so the pin can no longer change/)).toBeTruthy();
});

it("draws a dearer change as a proposal beside the pin in use", async () => {
  const change: api.DeliveryPinChange = {
    id: "pin_1",
    status: "pending_payment",
    point: { lat: 7.12, lng: 125.64, label: "Main gate, Davao City" },
    zone: "long_distance",
    distanceMeters: 9100,
    deliveryFeeMinor: 15000,
    feeDifferenceMinor: 6000,
    createdAt: "2026-10-15T03:00:00.000Z",
  };
  await render(<DeliveryPinCard order={order({ ...basePin, change })} {...props} />);
  expect(screen.getByText("Pay ₱60.00 to save your new pin")).toBeTruthy();
  expect(screen.getByText("Pin in use")).toBeTruthy();
  expect(screen.getByText("Main gate, Davao City")).toBeTruthy();
  expect(screen.getByText("Long Distance · ₱60.00 more to deliver here")).toBeTruthy();
  expect(screen.getByText("payment form (primary)")).toBeTruthy();
  expect(screen.queryByText("Yes, I'll be here")).toBeNull();
});

it("names who will be there once someone else receives it", async () => {
  const confirmed = { ...basePin, status: "confirmed", confirmedAt: "2026-10-15T03:00:00.000Z", receiverName: "Maria Santos" };
  await render(<DeliveryPinCard order={order(confirmed)} {...props} />);
  expect(screen.getByText(/^You confirmed Maria Santos will be here/)).toBeTruthy();
  expect(screen.getByText("Maria Santos receives it")).toBeTruthy();
});

it("shows a used change honestly", async () => {
  const used: api.DeliveryPin = {
    ...basePin,
    status: "confirmed",
    confirmedAt: "2026-10-15T04:00:00.000Z",
    changeUsed: true,
    canChange: false,
    receiverName: "Alex",
    notes: "Blue gate",
    change: {
      id: "pin_1",
      status: "applied",
      point,
      zone: "nearby",
      distanceMeters: 2100,
      deliveryFeeMinor: 4900,
      feeDifferenceMinor: -4000,
      createdAt: "2026-10-15T03:00:00.000Z",
      appliedAt: "2026-10-15T03:00:00.000Z",
      refundRequestId: "refund_1",
    },
  };
  await render(<DeliveryPinCard order={order(used)} {...props} />);
  expect(screen.getByText("You'll be there")).toBeTruthy();
  expect(screen.getByText("Alex receives it")).toBeTruthy();
  expect(screen.getByText("Blue gate")).toBeTruthy();
  expect(screen.getByText("You have used your one pin change.")).toBeTruthy();
  expect(screen.getByText("Pin change · ₱40.00 delivery-fee credit")).toBeTruthy();
  expect(screen.queryByText("Change pin")).toBeNull();
});

// Presses spend the file's render budget: keep this last.
it("confirms presence at the pin in use with the current version", async () => {
  const saved = { ...basePin, status: "confirmed", version: 4, confirmedAt: "2026-10-15T04:00:00.000Z" };
  jest.mocked(api.confirmDeliveryPin).mockResolvedValue(saved);
  await render(<DeliveryPinCard order={order(basePin)} {...props} />);
  await fireEvent.press(screen.getByText("Yes, I'll be here"));
  await waitFor(() => expect(props.onUpdated).toHaveBeenCalledWith(saved));
  expect(api.confirmDeliveryPin).toHaveBeenCalledWith("ord_1", { expectedVersion: 3 }, "key-1");
});
