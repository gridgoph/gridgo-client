import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";

import JoinGroupScreen from "@/app/express/group/join/[token]";
import * as api from "@/lib/api";
import { useExpressGroup } from "@/store/expressGroup";
import { usePendingGroupInvite } from "@/store/pendingGroupInvite";
import { groupFixture } from "@/test/expressGroup";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => {
  const router = { push: jest.fn(), replace: jest.fn(), canGoBack: () => true };
  return { Stack: { Screen: () => null }, useLocalSearchParams: () => ({ token: "tok_invite_123456789012" }), useRouter: () => router };
});
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getExpressGroupInvite: jest.fn(),
  listMyExpressGroups: jest.fn(async () => []),
  joinExpressGroup: jest.fn(),
}));

const invite = (closesInMinutes: number): api.ExpressGroupInvite => ({
  id: "grp_1",
  hostName: "Ana Cruz",
  quoteStatus: "priced",
  people: 2,
  closesAt: new Date(Date.now() + closesInMinutes * 60_000).toISOString(),
  fulfillmentMode: "delivery",
});

beforeEach(() => {
  useExpressGroup.getState().reset();
  usePendingGroupInvite.setState({ token: "tok_invite_123456789012" });
});

// gridgo-client#450: who invited you, what it is for, how long is left, then one button.
it("shows who invited you, the time left and one join button", async () => {
  jest.mocked(api.getExpressGroupInvite).mockResolvedValue(invite(20));
  await renderScreen(<JoinGroupScreen />);
  expect(await screen.findByText("Ana invited you")).toBeTruthy();
  expect(screen.getByText("Join Ana's group")).toBeTruthy();
  expect(screen.getByText("2 people in so far")).toBeTruthy();
  expect(screen.getByText(/Ana cannot open them/)).toBeTruthy();
  expect(screen.getByLabelText(/^(19|20):\d\d left to add files$/)).toBeTruthy();
  // The invite a signed-out link was holding has now been opened.
  expect(usePendingGroupInvite.getState().token).toBeNull();
});

it("says a full group calmly and offers printing alone", async () => {
  jest.mocked(api.getExpressGroupInvite).mockRejectedValue(new api.ApiError(409, { error: "group_full" }));
  await renderScreen(<JoinGroupScreen />);
  expect(await screen.findByText("This group is closed")).toBeTruthy();
  expect(screen.getByText("This group is full.")).toBeTruthy();
  expect(screen.getByText("Print on your own")).toBeTruthy();
});

// One press per file: this test goes last.
it("joins and opens the group", async () => {
  jest.mocked(api.getExpressGroupInvite).mockResolvedValue(invite(20));
  jest.mocked(api.joinExpressGroup).mockResolvedValue(groupFixture());
  await renderScreen(<JoinGroupScreen />);
  fireEvent.press(await screen.findByText("Join Ana's group"));
  await waitFor(() => expect(api.joinExpressGroup).toHaveBeenCalledWith("tok_invite_123456789012"));
  await waitFor(() => expect(useRouter().replace).toHaveBeenCalledWith({ pathname: "/express/group/[id]", params: { id: "grp_1" } }));
});
