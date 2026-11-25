import { screen } from "@testing-library/react-native";

import MemberInviteScreen from "@/app/organization/invite";
import { renderScreen, officerApi as api, signInOfficer } from "@/test/organizationScreens";

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


jest.mock("expo-linking", () => ({ createURL: () => "gridgo-client:///" }));

beforeEach(() => {
  jest.clearAllMocks();
  signInOfficer();
});

it("shows the QR, the link, and every way to hand it out", async () => {
  await renderScreen(<MemberInviteScreen />);
  expect(await screen.findByLabelText("QR code to join SAMPLE, SY 2026-27")).toBeOnTheScreen();
  expect(screen.getByTestId("member-link")).toHaveTextContent("gridgo-client:///join/tok");
  for (const name of ["Copy", "Share link", "Save QR", "Make a new link"]) {
    expect(screen.getByText(name)).toBeOnTheScreen();
  }
  expect(screen.getByText("Upload member list")).toBeOnTheScreen();
});

it("hands out nothing when the link was not read", async () => {
  api.getMemberInvite.mockRejectedValue(new Error("offline"));
  await renderScreen(<MemberInviteScreen />);
  expect(await screen.findByText("Invite link not loaded")).toBeOnTheScreen();
  expect(screen.queryByText("Share link")).toBeNull();
});
