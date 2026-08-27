import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AccountScreen from "@/app/(tabs)/account";
import { usePriorities } from "@/store/priorities";
import { useSession } from "@/store/session";

const PHOTO = "https://img.clerk.com/ana.jpg";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

// Displaying the picture is RN Image + Clerk's URL. The picker is not in this
// graph — a USB binary without ExponentImagePicker still has to show the card.
jest.mock("expo-image-picker", () => {
  throw new Error("Cannot find native module 'ExponentImagePicker'");
});

jest.mock("@clerk/expo", () => ({
  useUser: () => ({
    user: {
      imageUrl: PHOTO,
      hasImage: true,
      fullName: "Ana Bautista",
      primaryEmailAddress: { emailAddress: "ana@bautista.ph" },
    },
    isLoaded: true,
  }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getAccount: jest.fn(), logout: jest.fn(async () => undefined) };
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
 * Its own file: Account re-reads `/me` on focus, and this stack empties later
 * renders in the same file after that async write (see AGENTS.md).
 */
describe("the identity card's picture", () => {
  beforeEach(() => {
    api.getAccount.mockReset();
    api.getAccount.mockResolvedValue({
      id: "u1",
      email: "ana@bautista.ph",
      name: "Ana Bautista",
      role: "client",
      phone: "+639171234567",
      accountType: "individual",
      version: 3,
    });
    usePriorities.setState({ ranking: null, loaded: true, loading: false, error: null });
    useSession.setState({
      user: {
        id: "u1",
        email: "ana@bautista.ph",
        name: "Ana Bautista",
        role: "client",
        phone: "+639171234567",
        accountType: "individual",
        version: 3,
      },
      source: "clerk",
      loading: false,
      error: null,
      signingOut: false,
    });
  });

  it("draws Clerk's photo through RN Image, and does not load the picker", async () => {
    const source = readFileSync(join(__dirname, "../(tabs)/account.tsx"), "utf8");
    expect(source).not.toContain("expo-image-picker");

    const view = await renderInSafeArea(<AccountScreen />);
    await waitFor(() => expect(api.getAccount).toHaveBeenCalled());

    // ClientMonogram is hidden from the accessibility tree, so the URI on the
    // RN Image is what we can honestly assert without adding a test-only label.
    expect(JSON.stringify(view.toJSON())).toContain(PHOTO);
  });
});
