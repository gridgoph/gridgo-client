import { fireEvent, screen } from "@testing-library/react-native";

import ApproveMemberScreen from "@/app/organization/approve/[id]";
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


it("approves nobody without a date", async () => {
  signInOfficer();
  mockParams.current = { id: "m_req_1" };
  await renderScreen(<ApproveMemberScreen />);
  await fireEvent.press(await screen.findByText("Approve member"));
  expect(api.approveMember).not.toHaveBeenCalled();
  expect(await screen.findByText("Choose the month and year they joined.")).toBeOnTheScreen();
});
