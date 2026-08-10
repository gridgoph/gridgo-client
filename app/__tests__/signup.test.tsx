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

/**
 * Fill the fields a personal account needs.
 *
 * Awaited to the last value landing: React 19 defers these updates, and a
 * press dispatched before they flush reads an empty form.
 */
async function fillPersonal() {
  fireEvent.changeText(screen.getByLabelText("Your name"), "Ana Santos");
  fireEvent.changeText(screen.getByLabelText("Email"), "ana@company.com");
  fireEvent.changeText(screen.getByLabelText("Mobile number"), "0917 123 4567");
  fireEvent.changeText(screen.getByLabelText("Password"), "printit2026");
  await waitFor(() =>
    expect(screen.getByLabelText("Password").props.value).toBe("printit2026"),
  );
}

/*
  Ordering matters in this file, and it is not stylistic.

  @testing-library/react-native 14 on React 19 leaves its renderer unusable for
  the rest of a test file once a press has driven an async update into a store
  outside React — every later `render` in the file, even of a bare `<Text>`,
  produces an empty tree. So the one test that actually submits the form is
  last, and the other submitting case lives in `signup-error.test.tsx`. Adding a
  test after a submitting one will fail for this reason and not for yours.
*/
describe("SignupScreen", () => {
  beforeEach(() => {
    api.signupClient.mockReset();
    useSession.setState({ user: null, loading: false, error: null });
  });

  it("asks what kind of client this is, because it decides the branding", async () => {
    await renderInSafeArea(<SignupScreen />);

    expect(screen.getByText("Create your account")).toBeTruthy();
    expect(screen.getByLabelText("Account type")).toBeTruthy();
    // Personal is the default and needs no organisation name.
    expect(screen.queryByLabelText("Organization name")).toBeNull();
  });

  it("says what is missing instead of a dead greyed-out button", async () => {
    await renderInSafeArea(<SignupScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Create account" }));

    expect(api.signupClient).not.toHaveBeenCalled();
    expect(await screen.findAllByText(/Enter the name this account belongs to/)).toBeTruthy();
  });

  it("never offers to create a supplier or rider account", async () => {
    await renderInSafeArea(<SignupScreen />);

    expect(screen.queryByText(/^Supplier$/)).toBeNull();
    expect(screen.queryByText(/^Rider$/)).toBeNull();
    expect(screen.getByText(/sign up in their own app/i)).toBeTruthy();
  });

  it("creates a personal account and signs straight into it", async () => {
    api.signupClient.mockResolvedValue({
      token: "tok_1",
      user: {
        id: "user_1",
        email: "ana@company.com",
        name: "Ana Santos",
        role: "client",
        accountType: "individual",
      },
    });

    await renderInSafeArea(<SignupScreen />);
    await fillPersonal();
    fireEvent.press(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(api.signupClient).toHaveBeenCalled());
    expect(api.signupClient).toHaveBeenCalledWith({
      email: "ana@company.com",
      password: "printit2026",
      name: "Ana Santos",
      phone: "0917 123 4567",
      accountType: "individual",
    });
    await waitFor(() => expect(useSession.getState().user?.accountType).toBe("individual"));
  });
});
