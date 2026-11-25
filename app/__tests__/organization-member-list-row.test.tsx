import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import MemberListRowScreen from "@/app/organization/member-list-row";
import { useMemberListDraft } from "@/store/memberListDraft";
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
  mockParams.current = {};
});

it("adds a person with every field empty", async () => {
  await renderScreen(<MemberListRowScreen />);
  expect(screen.getByText("Add a person")).toBeOnTheScreen();
  expect(screen.getByLabelText("Name")).toHaveDisplayValue("");
  expect(screen.getByText("Add to list")).toBeOnTheScreen();
});

it("fixes a row: says what GRIDGO found, and checks only that row", async () => {
  useMemberListDraft.getState().choose("members.csv", [{ name: "Bea Example", contact: "nope", memberSince: "2025-01" }]);
  const key = useMemberListDraft.getState().rows[0]!.key;
  useMemberListDraft.setState({ step: "checked", fixes: [{ key, message: "No working email or mobile" }] });
  mockParams.current = { key };
  api.checkMemberList.mockResolvedValue({
    rowCount: 1, readyCount: 1, alreadyListedCount: 0, needsFixCount: 0, needsFix: [], emailCount: 1, mobileCount: 0,
  });
  await renderScreen(<MemberListRowScreen />);
  expect(screen.getByText("GRIDGO found: no working email or mobile.")).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText("Email or mobile"), "bea@example.com");
  await waitFor(() => expect(screen.getByLabelText("Email or mobile")).toHaveDisplayValue("bea@example.com"));
  await fireEvent.press(screen.getByText("Check this row"));
  await waitFor(() =>
    expect(api.checkMemberList).toHaveBeenCalledWith([{ name: "Bea Example", contact: "bea@example.com", memberSince: "2025-01" }]),
  );
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
});
