import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import ApproveMemberScreen from "@/app/organization/approve/[id]";
import { REQUEST, TERM } from "@/test/organizationMembers";
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
  mockParams.current = { id: "m_req_1" };
});

it("starts with no date, because the day they asked is not the day they joined", async () => {
  await renderScreen(<ApproveMemberScreen />);
  expect(await screen.findByText("Alex Sample")).toBeOnTheScreen();
  expect(screen.getByText("Month")).toBeOnTheScreen();
  expect(screen.getByText("Year")).toBeOnTheScreen();
  expect(screen.getByText("SY 2026-27")).toBeOnTheScreen();
  expect(screen.getByText("The real month they joined, not today. Long-time members keep their history.")).toBeOnTheScreen();
});

it("says when the request was already answered", async () => {
  api.listMemberRequests.mockResolvedValue({ requests: [], total: 0, nextCursor: null });
  await renderScreen(<ApproveMemberScreen />);
  expect(await screen.findByText("Already answered")).toBeOnTheScreen();
});

it("says it could not load", async () => {
  api.listMemberRequests.mockRejectedValue(new Error("offline"));
  await renderScreen(<ApproveMemberScreen />);
  expect(await screen.findByText("Request not loaded")).toBeOnTheScreen();
});

it("keeps a returning member's own date, and approves with it", async () => {
  api.listMemberRequests.mockResolvedValue({
    requests: [{ ...REQUEST, memberSince: "2023-02-14", termsCount: 2 }],
    total: 1,
    nextCursor: null,
  });
  api.approveMember.mockResolvedValue({} as never);
  await renderScreen(<ApproveMemberScreen />);
  expect(await screen.findByText("February")).toBeOnTheScreen();
  await fireEvent.press(screen.getByText("Approve member"));
  await waitFor(() => expect(api.approveMember).toHaveBeenCalledWith("m_req_1", 1, "2023-02-14", TERM.code));
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
});
