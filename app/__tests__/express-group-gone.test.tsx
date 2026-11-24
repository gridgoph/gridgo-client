import { screen } from "@testing-library/react-native";

import * as api from "@/lib/api";
import { memberGroupFixture } from "@/test/expressGroup";
import { renderGroup } from "@/test/expressGroupScreen";

jest.mock("expo-router", () => jest.requireActual("@/test/expressGroupMocks").groupScreenMocks.router());
jest.mock("@/lib/api", () => jest.requireActual("@/test/expressGroupMocks").groupScreenMocks.api());
jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: () => undefined }));
jest.mock("@/components/DeliveryMap", () => ({ DeliveryMap: () => null }));

// gridgo-client#451: a removed member is told calmly, with a way on, not "did not load".
it("tells a removed member they are no longer in the group", async () => {
  await renderGroup("u_b", null, null, new api.ApiError(403, { error: "group_membership_required" }));
  expect(await screen.findByText("Not in this group")).toBeTruthy();
  expect(screen.getByText("You are no longer in this group. Your files were not ordered.")).toBeTruthy();
  expect(screen.getByText("Print on your own")).toBeTruthy();
  expect(screen.queryByText("Try again")).toBeNull();
});

it("tells a member of a cancelled group they owe the host nothing", async () => {
  await renderGroup("u_b", memberGroupFixture({ state: "cancelled", status: "cancelled", cancelReason: "no_shop_in_zone" }));
  expect(await screen.findByText("Group cancelled")).toBeTruthy();
  expect(screen.getByText("No shop in the same area could take it, so GRIDGO cancelled it.")).toBeTruthy();
  expect(screen.getByText("Nothing was printed, so you owe Ana nothing.")).toBeTruthy();
  expect(screen.queryByText("See your refund")).toBeNull();
});
