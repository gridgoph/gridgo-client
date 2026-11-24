import { screen } from "@testing-library/react-native";

import * as api from "@/lib/api";
import { groupFixture, readyPickupTracking } from "@/test/expressGroup";
import { renderGroup } from "@/test/expressGroupScreen";

jest.mock("expo-router", () => jest.requireActual("@/test/expressGroupMocks").groupScreenMocks.router());
jest.mock("@/lib/api", () => jest.requireActual("@/test/expressGroupMocks").groupScreenMocks.api());
jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: () => undefined }));
jest.mock("@/components/DeliveryMap", () => ({ DeliveryMap: () => null }));

const ordered = { state: "ordered" as const, status: "ready", fulfillmentMode: "pickup" as const, tracking: { orderId: "ord_1", state: "ready_for_dispatch", fulfillmentMode: "pickup", updatedAt: "2026-11-24T02:47:00.000Z", estimatedArrivalAt: null } };

// gridgo-client#450/#451: the host sees everyone, the one fare split, and the close action.
it("shows the host every share, the split fare, and Close and check out", async () => {
  await renderGroup("u_host", groupFixture({ closesAt: new Date(Date.now() + 20 * 60_000).toISOString() }));
  expect(await screen.findByText("Close and check out")).toBeTruthy();
  expect(screen.getByText("Ben")).toBeTruthy();
  expect(screen.getAllByText("₱26.05")).toHaveLength(2);
  expect(screen.getByText("₱51.10")).toBeTruthy();
  expect(screen.getByText("Invite people")).toBeTruthy();
  expect(screen.getByLabelText("Delivery ₱13.00 each instead of ₱25.00")).toBeTruthy();
});

// gridgo-client#452 and gridgo-api#414: only the host gets the code and the use-or-cancel choice.
it("gives the host the pickup code and the replacement-shop choice", async () => {
  const decision = {
    status: "pending",
    supplierId: "s_2",
    shopName: "Second Test Shop",
    location: { lat: 7.08, lng: 125.61, label: "Poblacion" },
    distanceMeters: 1564,
    openedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 4 * 60_000).toISOString(),
  };
  await renderGroup("u_host", groupFixture(ordered), readyPickupTracking({ pickupCode: "236096", shopDecision: decision }));
  expect(await screen.findByText("236 096")).toBeTruthy();
  expect(screen.getByText("Use this shop")).toBeTruthy();
  expect(screen.getByText("Cancel for free")).toBeTruthy();
  expect(screen.getByText("Second Test Shop")).toBeTruthy();
});

it("names the hub-free pickup shop once GRIDGO has said which one", async () => {
  const decision = { status: "use", supplierId: "s_2", shopName: "Second Test Shop", location: { lat: 7.08, lng: 125.61, label: "Poblacion" }, distanceMeters: 1, openedAt: "x", deadlineAt: "x" };
  await renderGroup("u_host", groupFixture(ordered), readyPickupTracking({ pickupCode: "236096", shopDecision: decision }));
  expect(await screen.findByText("Show it at Second Test Shop · Poblacion. Only you can see it.")).toBeTruthy();
  expect(api.getExpressGroupTracking).toHaveBeenCalledWith("grp_1");
});
