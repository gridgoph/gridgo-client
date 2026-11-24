import { screen } from "@testing-library/react-native";

import { memberGroupFixture, readyPickupTracking } from "@/test/expressGroup";
import { renderGroup } from "@/test/expressGroupScreen";

jest.mock("expo-router", () => jest.requireActual("@/test/expressGroupMocks").groupScreenMocks.router());
jest.mock("@/lib/api", () => jest.requireActual("@/test/expressGroupMocks").groupScreenMocks.api());
jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: () => undefined }));
jest.mock("@/components/DeliveryMap", () => ({ DeliveryMap: () => null }));

// gridgo-client#451: a member sees only their own total and pages, never another person or the fare.
it("shows a member what they owe the host and nobody else's share", async () => {
  await renderGroup("u_b", memberGroupFixture({ closesAt: new Date(Date.now() + 20 * 60_000).toISOString() }));
  expect(await screen.findByText("You owe Ana")).toBeTruthy();
  expect(screen.getByText("₱26.05")).toBeTruthy();
  expect(screen.getByText("Prints · 3 pages")).toBeTruthy();
  expect(screen.queryByText("Everyone")).toBeNull();
  expect(screen.queryByText("Close and check out")).toBeNull();
  expect(screen.getByText("Edit my files")).toBeTruthy();
  expect(screen.getByText("Leave group")).toBeTruthy();
});

// gridgo-client#452: shared tracking, without the host's code.
it("tracks the ready group for a member without the pickup code", async () => {
  const group = memberGroupFixture({ state: "ordered", status: "ready", fulfillmentMode: "pickup", tracking: { orderId: "ord_1", state: "ready_for_dispatch", fulfillmentMode: "pickup", updatedAt: "x", estimatedArrivalAt: null } });
  await renderGroup("u_b", group, readyPickupTracking({ me: group.me, pickupCode: "236096" }));
  expect(await screen.findByText("Ready. Ana is picking it up for everyone.")).toBeTruthy();
  expect(screen.queryByText("236 096")).toBeNull();
  expect(screen.getByText("Ana has not marked you as paid back yet.")).toBeTruthy();
});

it("says a paid-back member paid, without the reminder", async () => {
  const base = memberGroupFixture({ state: "ordered", status: "picked_up", fulfillmentMode: "pickup", tracking: { orderId: "ord_1", state: "issue_window_open", fulfillmentMode: "pickup", updatedAt: "x", estimatedArrivalAt: null } });
  const group = { ...base, me: { ...base.me, paidBack: true } };
  await renderGroup("u_b", group, readyPickupTracking({ me: group.me, state: "issue_window_open" }));
  expect(await screen.findByText("You paid Ana")).toBeTruthy();
  expect(screen.getByText("Ana marked you as paid back.")).toBeTruthy();
  expect(screen.queryByText(/Pay Ana back/)).toBeNull();
});
