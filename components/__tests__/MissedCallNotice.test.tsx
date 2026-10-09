import { render, screen, waitFor } from "@testing-library/react-native";

import { MissedCallNotice } from "@/components/call/MissedCallNotice";
import type { OrderCall } from "@/lib/orderCalls";
import { useCall } from "@/store/call";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => effect(), [effect]);
  },
}));

const mockCalls: { current: OrderCall[] } = { current: [] };
jest.mock("@/lib/api", () => ({
  listOrderCalls: jest.fn(async () => mockCalls.current),
}));

const ORDER = "ord_example";
const open = { status: "open", closesAt: null, retentionHours: 24 };

function call(overrides: Partial<OrderCall> = {}): OrderCall {
  return {
    id: "e115b493-dee1-448f-b6ba-a9868f448df2",
    orderId: ORDER,
    pair: "delivery",
    state: "missed",
    caller: { firstName: "Sam", role: "rider" },
    callee: { firstName: "Alex", role: "client" },
    mine: false,
    createdAt: "2026-10-08T08:00:00.000Z",
    ringExpiresAt: "2026-10-08T08:00:30.000Z",
    acceptedAt: null,
    endedAt: "2026-10-08T08:00:30.000Z",
    leaseExpiresAt: null,
    ...overrides,
  };
}

beforeEach(() => useCall.getState().reset());

it("says who called and offers to call back while the rider has the delivery", async () => {
  mockCalls.current = [call()];
  await render(<MissedCallNotice order={{ id: ORDER, deliveryChat: open }} />);
  expect(await screen.findByText("Missed call from Sam")).toBeTruthy();
  expect(screen.getByText("Call back")).toBeTruthy();
});

it("keeps the notice but drops Call back once the delivery is done", async () => {
  mockCalls.current = [call()];
  await render(<MissedCallNotice order={{ id: ORDER, deliveryChat: { ...open, status: "read_only" } }} />);
  expect(await screen.findByText("Missed call from Sam")).toBeTruthy();
  expect(screen.queryByText("Call back")).toBeNull();
});

it("draws nothing once anyone has called since", async () => {
  mockCalls.current = [call({ id: "later", mine: true, state: "ended", createdAt: "2026-10-08T08:05:00.000Z" }), call()];
  await render(<MissedCallNotice order={{ id: ORDER, deliveryChat: open }} />);
  await waitFor(() => expect(useCall.getState().callsByOrder[ORDER]).toHaveLength(2));
  expect(screen.queryByText("Missed call from Sam")).toBeNull();
});
