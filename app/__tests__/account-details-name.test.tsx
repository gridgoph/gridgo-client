import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AccountDetailsScreen from "@/app/account-details";
import { useSession } from "@/store/session";

/**
 * gridgo-client#337 on the screen: "Mark" saved over "Mark David" left the
 * sign-in as "Mark David", because a one-word name never sent a last name.
 * Its own file: a whole save (a change and a press) spends the file.
 */

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

const mockClerkUser = {
  fullName: "Mark David",
  firstName: "Mark",
  lastName: "David",
  imageUrl: "https://img.clerk.com/initials.png",
  hasImage: false,
  primaryEmailAddress: { emailAddress: "mark@david.ph" },
  setProfileImage: jest.fn(),
  update: jest.fn(async () => undefined),
  reload: jest.fn(async () => undefined),
};

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: mockClerkUser, isLoaded: true }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getAccount: jest.fn(), patchAccount: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const CLIENT = {
  id: "u1",
  email: "mark@david.ph",
  name: "Mark David",
  role: "client" as const,
  phone: "+639171234567",
  accountType: "individual" as const,
  version: 3,
};

describe("Your details, saving a one-word name", () => {
  beforeEach(() => {
    api.getAccount.mockResolvedValue(CLIENT);
    api.patchAccount.mockResolvedValue({ ...CLIENT, name: "Mark", version: 4 });
    useSession.setState({
      user: CLIENT,
      source: "clerk",
      loading: false,
      error: null,
      signingOut: false,
    });
  });

  it("writes exactly that name to GRIDGO and clears the sign-in's surname", async () => {
    await render(<AccountDetailsScreen />, {
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
    await waitFor(() => expect(api.getAccount).toHaveBeenCalled());

    fireEvent.changeText(screen.getByLabelText("Your name"), "Mark");
    await waitFor(() => expect(screen.getByLabelText("Your name").props.value).toBe("Mark"));
    fireEvent.press(await screen.findByText("Save changes"));

    await waitFor(() => expect(mockClerkUser.update).toHaveBeenCalled());
    expect(api.patchAccount).toHaveBeenCalledWith({ name: "Mark" }, 3);
    expect(mockClerkUser.update).toHaveBeenCalledWith({ firstName: "Mark", lastName: "" });
    expect(useSession.getState().user?.name).toBe("Mark");
  });
});
