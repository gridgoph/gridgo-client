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
 * Setting a new password on the sign-in.
 *
 * Clerk's own user resource does this — `user.updatePassword`, whose shape was
 * read off the installed `@clerk/expo` types rather than assumed — so the
 * client stays signed in and never sees a reset code they did not need.
 *
 * The assertion that matters most is `signOutOfOtherSessions`. Somebody
 * changing a password on a phone is either tidying up or locking somebody out,
 * and the second is the reason that matters; the screen promises that in words
 * above the button, so the call has to actually do it.
 *
 * One test per file: the submit drives async state, and this stack empties
 * every later render in the same file once that has happened (see AGENTS.md).
 */
describe("changing the sign-in password", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockUpdatePassword.mockClear();
  });

  it("sends both passwords to Clerk and signs every other session out", async () => {
    await renderScreen();

    // Promised before the tap, not reported after it.
    expect(
      screen.getByText(/signs you out everywhere else you are signed in/i),
    ).toBeTruthy();

    await type("Current password", "oldpassword");
    await type("New password", "newpassword");
    await type("Confirm new password", "newpassword");

    fireEvent.press(screen.getByText("Change password"));

    await waitFor(() =>
      expect(mockUpdatePassword).toHaveBeenCalledWith({
        currentPassword: "oldpassword",
        newPassword: "newpassword",
        signOutOfOtherSessions: true,
      }),
    );

    // The screen confirms rather than vanishing: signing other sessions out is
    // a consequence somebody may need to act on.
    await waitFor(() => expect(screen.getByText("Password changed")).toBeTruthy());
    expect(mockBack).not.toHaveBeenCalled();
  });
});
