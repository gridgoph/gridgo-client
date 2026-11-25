import { screen } from "@testing-library/react-native";

import MyOrgsScreen from "@/app/my-orgs/index";
import { ApiError } from "@/lib/api";
import * as memberApi from "@/lib/membershipsApi";
import { useMemberships } from "@/store/memberships";
import { useSession } from "@/store/session";
import { membership, membershipMatch } from "@/test/membershipFixtures";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  const router = { push: jest.fn(), replace: jest.fn(), canGoBack: () => true };
  return {
    Stack: { Screen: () => null },
    useRouter: () => router,
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock("@/lib/membershipsApi");
const api = jest.mocked(memberApi);
const answer = (over: Partial<memberApi.MembershipList>) =>
  api.listMemberships.mockResolvedValue({ serverTime: "2026-11-26T02:00:00.000Z", memberships: [], matches: [], ...over });

beforeEach(() => {
  useSession.setState({ user: { id: "u1", accountType: "individual", role: "client" } as never });
  useMemberships.getState().reset();
});

it("an active membership shows its perk as up to, uses, last day and what it saved", async () => {
  answer({ memberships: [membership()] });
  await renderScreen(<MyOrgsScreen />);
  expect(await screen.findByText("Sample Guild")).toBeTruthy();
  expect(screen.getByText("Sample Guild of Makers")).toBeTruthy();
  expect(screen.getByText("Member since Sep 2025")).toBeTruthy();
  expect(screen.getByText("Member")).toBeTruthy();
  expect(screen.getByText("Up to ₱10.00 off")).toBeTruthy();
  expect(screen.getByText("each order · comes off at checkout by itself")).toBeTruthy();
  expect(screen.getByLabelText("2 of 5 used this term, 3 of 5 left")).toBeTruthy();
  expect(screen.getByText("Valid until 31 May 2027")).toBeTruthy();
  expect(screen.getByLabelText("You have saved ₱20.00")).toBeTruthy();
  expect(screen.getByText("Leave Sample Guild")).toBeTruthy();
  expect(screen.getByText("Join another org")).toBeTruthy();
  expect(screen.getByText(/Never what you printed/)).toBeTruthy();
  expect(screen.queryByText(/service fee/i)).toBeNull();
});

it("a request waiting for the officer can be cancelled", async () => {
  answer({ memberships: [membership({ status: "pending", memberSince: null, totalSavedMinor: 0 })] });
  await renderScreen(<MyOrgsScreen />);
  expect(await screen.findByText("Waiting for approval")).toBeTruthy();
  expect(screen.getByText("Asked 3 Nov 2026")).toBeTruthy();
  expect(screen.getByText("Cancel request")).toBeTruthy();
  expect(screen.queryByText("Up to ₱10.00 off")).toBeNull();
});

it("an ended term, a declined request and a list match each say what they are", async () => {
  answer({
    memberships: [
      membership({ status: "expired" }),
      membership({ id: "mem_2", label: "Art Circle member", status: "removed", removedReason: "declined" }),
    ],
    matches: [membershipMatch({ id: "mle_2", label: "Film Club member" })],
  });
  await renderScreen(<MyOrgsScreen />);
  expect(await screen.findByText("You’re a Film Club member")).toBeTruthy();
  expect(screen.getByText("Term ended")).toBeTruthy();
  expect(screen.getByText(/SY 2026-27 ended/)).toBeTruthy();
  expect(screen.getByText(/did not approve this request/)).toBeTruthy();
});

it("nobody yet: one clear way in", async () => {
  answer({});
  await renderScreen(<MyOrgsScreen />);
  expect(await screen.findByText("Join your org")).toBeTruthy();
  expect(screen.getByText("Join an org")).toBeTruthy();
  expect(screen.queryByText("Join another org")).toBeNull();
});

it("a read that failed says so and can be tried again", async () => {
  api.listMemberships.mockRejectedValue(new ApiError(500, { error: "server_error" }));
  await renderScreen(<MyOrgsScreen />);
  expect(await screen.findByText("Not loaded")).toBeTruthy();
  expect(screen.getByText("Try again")).toBeTruthy();
});

it("an older GRIDGO says it is not open yet", async () => {
  api.listMemberships.mockRejectedValue(new ApiError(404, { error: "not_found" }));
  await renderScreen(<MyOrgsScreen />);
  expect(await screen.findByText(/not open yet/)).toBeTruthy();
});

it("holds the shape while it loads", async () => {
  api.listMemberships.mockReturnValue(new Promise(() => undefined));
  await renderScreen(<MyOrgsScreen />);
  expect(screen.getByLabelText("Loading your orgs")).toBeTruthy();
});

it("an organization account can leave what it held but is offered nothing to join", async () => {
  useSession.setState({ user: { id: "u1", accountType: "organization", role: "client" } as never });
  answer({ memberships: [membership()] });
  await renderScreen(<MyOrgsScreen />);
  expect(await screen.findByText("Leave Sample Guild")).toBeTruthy();
  expect(screen.queryByText("Join another org")).toBeNull();
});
