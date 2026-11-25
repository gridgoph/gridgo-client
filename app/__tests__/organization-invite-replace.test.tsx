import { fireEvent, screen } from "@testing-library/react-native";

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

it("asks before the link people already have stops working", async () => {
  signInOfficer();
  await renderScreen(<MemberInviteScreen />);
  await fireEvent.press(await screen.findByText("Make a new link"));
  expect(await screen.findByText("Make a new link?")).toBeOnTheScreen();
  expect(screen.getByText(/stop working right away/)).toBeOnTheScreen();
  expect(api.createMemberInvite).not.toHaveBeenCalled();
});
