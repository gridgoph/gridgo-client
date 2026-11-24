import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";

import NewGroupScreen from "@/app/express/group/new";
import * as api from "@/lib/api";
import { useExpressGroup } from "@/store/expressGroup";
import { groupFixture } from "@/test/expressGroup";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  const router = { push: jest.fn(), replace: jest.fn(), canGoBack: () => true };
  return { useRouter: () => router, useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listAddresses: jest.fn(),
  createExpressGroup: jest.fn(),
}));

const HOME = { id: "addr_1", label: "Home", addressLine: "City Hall, San Pedro St", isDefault: true, point: { lat: 7.06, lng: 125.6 } };

// gridgo-client#450: a delivery group goes to the saved place, opens on the invite.
it("starts a delivery group to the saved place and opens the invite", async () => {
  useExpressGroup.getState().reset();
  jest.mocked(api.listAddresses).mockResolvedValue([HOME] as never);
  jest.mocked(api.createExpressGroup).mockResolvedValue({ group: groupFixture({ id: "grp_new" }), inviteToken: "tok" });
  await renderScreen(<NewGroupScreen />);
  fireEvent.press(await screen.findByText("Deliver"));
  await screen.findByText("City Hall, San Pedro St");
  fireEvent.press(screen.getByText("Start group"));
  await waitFor(() =>
    expect(api.createExpressGroup).toHaveBeenCalledWith({
      fulfillmentMode: "delivery",
      location: { lat: 7.06, lng: 125.6 },
      dropoff: { lat: 7.06, lng: 125.6, label: "City Hall, San Pedro St" },
      timeLimitMinutes: 30,
    }),
  );
  await waitFor(() => expect(useRouter().replace).toHaveBeenCalledWith({ pathname: "/express/group/[id]", params: { id: "grp_new", invite: "1" } }));
});
