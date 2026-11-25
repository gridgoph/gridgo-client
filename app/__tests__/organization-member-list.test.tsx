import { fireEvent, screen } from "@testing-library/react-native";

import MemberListScreen from "@/app/organization/member-list";
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


const ROWS = [
  { name: "Alex Sample", contact: "alex@example.com", memberSince: "2024-08" },
  { name: "Bea Example", contact: "nope", memberSince: "2025-01" },
];

beforeEach(() => {
  jest.clearAllMocks();
  signInOfficer();
});

async function checked() {
  useMemberListDraft.getState().choose("members.csv", ROWS);
  useMemberListDraft.getState().setConsent(true);
  api.checkMemberList.mockResolvedValueOnce({
    rowCount: 2,
    readyCount: 1,
    alreadyListedCount: 0,
    needsFixCount: 1,
    needsFix: [{ row: 2, field: "contact", code: "invalid_member_contact", message: "x" }],
    emailCount: 1,
    mobileCount: 0,
  });
  await useMemberListDraft.getState().check();
}

it("starts with the file, or one by one", async () => {
  await renderScreen(<MemberListScreen />);
  expect(screen.getByText("Choose file")).toBeOnTheScreen();
  expect(screen.getByText("Add one by one")).toBeOnTheScreen();
  expect(screen.queryByText("Check list")).toBeNull();
  expect(await screen.findByText("Are you a member of SAMPLE?")).toBeOnTheScreen();
});

it("starts the consent unticked", async () => {
  useMemberListDraft.getState().choose("members.csv", ROWS);
  await renderScreen(<MemberListScreen />);
  expect(screen.getByRole("checkbox", { checked: false })).toBeOnTheScreen();
  expect(screen.getByText("2 people")).toBeOnTheScreen();
  expect(screen.getByText("Contacts are used only for this invite, then deleted.")).toBeOnTheScreen();
});

it("counts emails, mobiles and rows to fix, and never who is already on GRIDGO", async () => {
  await checked();
  await renderScreen(<MemberListScreen />);
  expect(screen.getByText("1 person ready")).toBeOnTheScreen();
  expect(screen.getByLabelText(/^With an email: 1\./)).toBeOnTheScreen();
  expect(screen.getByLabelText(/^With a mobile number: 0\./)).toBeOnTheScreen();
  expect(screen.getByText("No working email or mobile")).toBeOnTheScreen();
  expect(screen.getByLabelText("Fix Bea Example")).toBeOnTheScreen();
  expect(screen.getByText("Save 1 person")).toBeOnTheScreen();
  expect(screen.queryByText(/already on GRIDGO|have an account|have accounts/i)).toBeNull();
});

it("says they are not members yet once saved, and keeps the row that was left out", async () => {
  await checked();
  api.saveMemberList.mockResolvedValue({
    rowCount: 1, readyCount: 1, alreadyListedCount: 0, needsFixCount: 0, needsFix: [], emailCount: 1, mobileCount: 0, savedCount: 1, expiresAt: null,
  });
  await useMemberListDraft.getState().save();
  await renderScreen(<MemberListScreen />);
  expect(screen.getByText("1 person saved")).toBeOnTheScreen();
  expect(screen.getByText(/not members yet/)).toBeOnTheScreen();
  expect(screen.getByText("1 row was left out")).toBeOnTheScreen();
});

it("checks nothing without the consent tick", async () => {
  useMemberListDraft.getState().choose("members.csv", ROWS);
  await renderScreen(<MemberListScreen />);
  await fireEvent.press(screen.getByText("Check list"));
  expect(api.checkMemberList).not.toHaveBeenCalled();
});
