import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SignupScreen from "@/app/(auth)/signup";
import { useSession } from "@/store/session";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, signupClient: jest.fn(), logout: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

/*
  A second file for a second submitting test — see the note in
  `signup.test.tsx` for why one file cannot hold both.
*/
describe("SignupScreen, when the API refuses", () => {
  it("turns a taken email into a next step, never an error code", async () => {
    api.signupClient.mockRejectedValue(
      new api.ApiError(409, { error: "email_already_registered" }),
    );
    useSession.setState({ user: null, loading: false, error: null });

    await renderInSafeArea(<SignupScreen />);
    fireEvent.changeText(screen.getByLabelText("Your name"), "Ana Santos");
    fireEvent.changeText(screen.getByLabelText("Email"), "taken@company.com");
    fireEvent.changeText(screen.getByLabelText("Mobile number"), "0917 123 4567");
    fireEvent.changeText(screen.getByLabelText("Password"), "printit2026");
    // React 19 defers these; a press before they land reads an empty form.
    await waitFor(() =>
      expect(screen.getByLabelText("Password").props.value).toBe("printit2026"),
    );
    fireEvent.press(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/already has a GRIDGO account/i)).toBeTruthy();
    expect(screen.queryByText(/email_already_registered/)).toBeNull();
    expect(useSession.getState().user).toBeNull();
  });
});

function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}
