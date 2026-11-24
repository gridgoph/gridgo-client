import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import * as api from "@/lib/api";
import { groupFixture } from "@/test/expressGroup";
import { renderGroup } from "@/test/expressGroupScreen";

jest.mock("expo-router", () => jest.requireActual("@/test/expressGroupMocks").groupScreenMocks.router());
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/test/expressGroupMocks").groupScreenMocks.api(),
  removeExpressGroupMember: jest.fn(),
}));
jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: () => undefined }));
jest.mock("@/components/DeliveryMap", () => ({ DeliveryMap: () => null }));

// gridgo-client#450: the host removes a member. The manage sheet closes under
// the question, and "Remove" must still know who it is about. This file's only
// test presses three times, so it stands alone.
it("removes the member the host chose, after asking", async () => {
  jest.mocked(api.removeExpressGroupMember).mockResolvedValue(groupFixture({ people: 2 }));
  await renderGroup("u_host", groupFixture({ closesAt: new Date(Date.now() + 20 * 60_000).toISOString() }));
  fireEvent.press(await screen.findByText("Ben"));
  fireEvent.press(await screen.findByText("Remove from group"));
  expect(await screen.findByText("Remove Ben?")).toBeTruthy();
  fireEvent.press(screen.getByText("Remove"));
  await waitFor(() => expect(api.removeExpressGroupMember).toHaveBeenCalledWith("grp_1", "u_b"));
});
