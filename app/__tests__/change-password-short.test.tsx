import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ChangePasswordScreen from "@/app/change-password";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: (...args: unknown[]) => mockBack(...args) },
}));

// Same binary as Your details: this screen loads clerkIdentity, which must
// not pull in the picker just because it lives in the same module.
jest.mock("expo-image-picker", () => {
  throw new Error("Cannot find native module 'ExponentImagePicker'");
});

const mockUpdatePassword = jest.fn(async () => undefined);

const mockClerkUser = {
  fullName: "Mark David",
  passwordEnabled: true,
  primaryEmailAddress: { emailAddress: "mark@david.ph" },
  updatePassword: mockUpdatePassword,
};

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: mockClerkUser, isLoaded: true }),
}));

function renderScreen() {
  return render(<ChangePasswordScreen />, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

/** Fill all three boxes and let each one land before the next is typed. */
async function type(label: string, value: string) {
  fireEvent.changeText(screen.getByLabelText(label), value);
  await waitFor(() => expect(screen.getByLabelText(label).props.value).toBe(value));
}

/**
 * The new password is held to Clerk's 15-character minimum before Clerk is
 * asked, in the same words sign-up uses. One press per test (see AGENTS.md).
 */
describe("changing the sign-in password to one that is too short", () => {
  it("states the rule and stops a 14-character password on its field", async () => {
    await renderScreen();
    expect(screen.getByText("At least 15 characters.")).toBeTruthy();

    await type("Current password", "old-gridgo-password");
    await type("New password", "gridgo-pw-14ch");
    await type("Confirm new password", "gridgo-pw-14ch");

    fireEvent.press(screen.getByText("Change password"));

    expect(await screen.findByText("Use at least 15 characters.")).toBeTruthy();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });
});
