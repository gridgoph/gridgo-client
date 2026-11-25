import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import MembersScreen from "@/app/organization/members";
import { ApiError } from "@/lib/api";
import { useOrganizationMembers } from "@/store/organizationMembers";
import { EXPIRED, SUMMARY, TERM } from "@/test/organizationMembers";
import { officerApi as api, renderScreen, signInOfficer } from "@/test/organizationScreens";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockParams: { current: Record<string, string> } = { current: {} };

jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    dismissTo: (...args: unknown[]) => mockDismissTo(...args),
    navigate: jest.fn(),
  },
  useLocalSearchParams: () => mockParams.current,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("@/lib/organizationMembersApi");


beforeEach(() => {
  jest.clearAllMocks();
  signInOfficer();
});

it("opens on the requests waiting, with the count, the term and one Invite", async () => {
  await renderScreen(<MembersScreen />);
  expect(await screen.findByText("47 members")).toBeOnTheScreen();
  expect(screen.getByText("SAMPLE · SY 2026-27")).toBeOnTheScreen();
  expect(screen.getByText(/^Term ends .*2027/)).toBeOnTheScreen();
  expect(await screen.findByText("Alex Sample")).toBeOnTheScreen();
  expect(screen.getByRole("tab", { name: "Requests · 2", selected: true })).toBeOnTheScreen();
  expect(screen.getByLabelText("Approve Alex Sample")).toBeOnTheScreen();
  expect(screen.getByLabelText("Decline Alex Sample")).toBeOnTheScreen();
  expect(screen.getAllByLabelText("Invite members")).toHaveLength(1);
});

it("opens on the member list when nobody is asking", async () => {
  api.getMembersSummary.mockResolvedValue({ ...SUMMARY, requestCount: 0 });
  await renderScreen(<MembersScreen />);
  expect(await screen.findByLabelText("Bea Example. Member since Aug 2024 · 3 terms. 5 orders this term")).toBeOnTheScreen();
  expect(screen.getByLabelText("Search members")).toBeOnTheScreen();
  // Each filter says how many it holds, in GRIDGO's own totals.
  expect(await screen.findByLabelText("Not yet 1")).toBeOnTheScreen();
});

it("says how to start when there are no members", async () => {
  api.getMembersSummary.mockResolvedValue({ ...SUMMARY, requestCount: 0, memberCount: 0 });
  api.listMembers.mockResolvedValue({ term: TERM, members: [], total: 0, nextCursor: null });
  await renderScreen(<MembersScreen />);
  expect(await screen.findByText("No members yet")).toBeOnTheScreen();
});

it("offers to renew members from an earlier term", async () => {
  api.getMembersSummary.mockResolvedValue({ ...SUMMARY, expiredCount: 9 });
  api.listMembers.mockResolvedValue({ term: TERM, members: [EXPIRED], total: 1, nextCursor: null });
  await renderScreen(<MembersScreen />);
  expect(await screen.findByText("9 members from an earlier term")).toBeOnTheScreen();
});

it("says it could not load, with a way to try again", async () => {
  api.getMembersSummary.mockRejectedValue(new Error("offline"));
  await renderScreen(<MembersScreen />);
  expect(await screen.findByText("Members not loaded")).toBeOnTheScreen();
  expect(screen.getByText("Try again")).toBeOnTheScreen();
});

it("keeps the list on screen offline and says it is from before", async () => {
  await useOrganizationMembers.getState().loadSummary();
  api.getMembersSummary.mockRejectedValue(new Error("offline"));
  await renderScreen(<MembersScreen />);
  expect(await screen.findByText("47 members")).toBeOnTheScreen();
  expect(await screen.findByText(/What you see is from before\.$/)).toBeOnTheScreen();
});

it("explains itself to an account that is not a partner", async () => {
  api.getMembersSummary.mockRejectedValue(new ApiError(403, { error: "organization_partner_required" }));
  await renderScreen(<MembersScreen />);
  expect(await screen.findByText("For GRIDGO partner organizations")).toBeOnTheScreen();
});

it("searches once typing settles", async () => {
  api.getMembersSummary.mockResolvedValue({ ...SUMMARY, requestCount: 0 });
  await renderScreen(<MembersScreen />);
  await screen.findByLabelText(/Bea Example/);
  await fireEvent.changeText(screen.getByLabelText("Search members"), "bea");
  await waitFor(() => expect(api.listMembers).toHaveBeenLastCalledWith({ q: "bea", filter: "all", status: "active" }));
  expect(api.listMembers.mock.calls.filter(([input]) => input?.q === "b")).toHaveLength(0);
});

it("opens the approval from a request", async () => {
  await renderScreen(<MembersScreen />);
  await fireEvent.press(await screen.findByLabelText("Approve Alex Sample"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/organization/approve/[id]", params: { id: "m_req_1" } });
});
