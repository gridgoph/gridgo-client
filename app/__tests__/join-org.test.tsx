import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";

import JoinOrgInviteScreen from "@/app/join/[token]";
import { ApiError } from "@/lib/api";
import * as memberApi from "@/lib/membershipsApi";
import { useMemberships } from "@/store/memberships";
import { usePendingJoin } from "@/store/pendingJoin";
import { useSession } from "@/store/session";
import { JOIN_TOKEN, membership, membershipInvite } from "@/test/membershipFixtures";
import { renderScreen } from "@/test/renderScreen";

let mockToken = "";
jest.mock("expo-router", () => {
  const router = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true };
  return {
    Stack: { Screen: () => null },
    useLocalSearchParams: () => ({ token: mockToken, source: "qr" }),
    useRouter: () => router,
  };
});
jest.mock("@/lib/membershipsApi");
const api = jest.mocked(memberApi);

beforeEach(() => {
  mockToken = JOIN_TOKEN;
  api.previewMembershipInvite.mockReset();
  useSession.setState({ user: { id: "u1", accountType: "individual", role: "client" } as never });
  useMemberships.getState().reset();
  usePendingJoin.setState({ token: JOIN_TOKEN });
});

it("says which org it is, what it gives, who decides, and what the officer sees", async () => {
  api.previewMembershipInvite.mockResolvedValue(membershipInvite());
  await renderScreen(<JoinOrgInviteScreen />);
  expect(await screen.findByText("Join Sample Guild")).toBeTruthy();
  expect(screen.getByText("Up to ₱10.00 off each of 5 orders this term")).toBeTruthy();
  expect(screen.getByText("The officer approves you")).toBeTruthy();
  expect(screen.getByText("Until 31 May 2027")).toBeTruthy();
  expect(screen.getByText("The officer sees your name and whether you ordered. Never what you printed.")).toBeTruthy();
  expect(screen.getByText("Request to join")).toBeTruthy();
  // The link a signed-out phone was holding has been opened.
  expect(usePendingJoin.getState().token).toBeNull();
});

it("promises no perk when there is none", async () => {
  api.previewMembershipInvite.mockResolvedValue(membershipInvite({ perk: null }));
  await renderScreen(<JoinOrgInviteScreen />);
  expect(await screen.findByText("Join Sample Guild")).toBeTruthy();
  expect(screen.queryByText(/₱/)).toBeNull();
});

it("a person who already asked is told so, not asked again", async () => {
  api.previewMembershipInvite.mockResolvedValue(membershipInvite({ membershipStatus: "pending" }));
  await renderScreen(<JoinOrgInviteScreen />);
  expect(await screen.findByText("Waiting for approval")).toBeTruthy();
  expect(screen.queryByText("Request to join")).toBeNull();
  expect(screen.getByText("See My orgs")).toBeTruthy();
});

it("a member is told there is nothing to do", async () => {
  api.previewMembershipInvite.mockResolvedValue(membershipInvite({ membershipStatus: "active" }));
  await renderScreen(<JoinOrgInviteScreen />);
  expect(await screen.findByText("You’re already in Sample Guild")).toBeTruthy();
});

it("an old link offers no retry, because trying again only spends a look-up", async () => {
  api.previewMembershipInvite.mockRejectedValue(new ApiError(404, { error: "member_invite_not_found" }));
  await renderScreen(<JoinOrgInviteScreen />);
  expect(await screen.findByText("Link not opened")).toBeTruthy();
  expect(screen.getByText(/newest link or QR/)).toBeTruthy();
  expect(screen.queryByText("Try again")).toBeNull();
});

it("a dropped connection can be tried again", async () => {
  api.previewMembershipInvite.mockRejectedValue(new ApiError(500, { error: "server_error" }));
  await renderScreen(<JoinOrgInviteScreen />);
  expect(await screen.findByText("Could not open the link")).toBeTruthy();
  expect(screen.getByText("Try again")).toBeTruthy();
});

it("a malformed link never reaches GRIDGO", async () => {
  mockToken = "short";
  await renderScreen(<JoinOrgInviteScreen />);
  expect(screen.getByText("Link not opened")).toBeTruthy();
  expect(api.previewMembershipInvite).not.toHaveBeenCalled();
});

it("an organization account is told whose link this is", async () => {
  useSession.setState({ user: { id: "org1", accountType: "organization", role: "client" } as never });
  await renderScreen(<JoinOrgInviteScreen />);
  expect(screen.getByText("This link is for members")).toBeTruthy();
  expect(api.previewMembershipInvite).not.toHaveBeenCalled();
});

// The one press, last in the file.
it("asks once and lands on My orgs", async () => {
  api.previewMembershipInvite.mockResolvedValue(membershipInvite());
  api.requestMembership.mockResolvedValue(membership({ status: "pending" }));
  await renderScreen(<JoinOrgInviteScreen />);
  fireEvent.press(await screen.findByText("Request to join"));
  await waitFor(() => expect(api.requestMembership).toHaveBeenCalledWith(JOIN_TOKEN, "qr"));
  await waitFor(() => expect(useRouter().dismissTo).toHaveBeenCalledWith("/my-orgs"));
});
