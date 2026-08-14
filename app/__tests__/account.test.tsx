import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AccountScreen from "@/app/(tabs)/account";
import { useSession } from "@/store/session";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

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

describe("AccountScreen", () => {
  beforeEach(() => {
    mockPush.mockClear();
    useSession.setState({
      user: {
        id: "u1",
        email: "client@gridgo.local",
        name: "Demo Client",
        role: "client",
        accountType: "business",
        orgName: "Demo Org",
      },
      loading: false,
      error: null,
    });
  });

  it("shows identity and a Settings destination row, not the theme control", async () => {
    await renderInSafeArea(<AccountScreen />);

    expect(screen.getByText("Demo Client")).toBeTruthy();
    expect(screen.getByText("client@gridgo.local")).toBeTruthy();
    expect(screen.getByText("Business client")).toBeTruthy();
    expect(screen.getByLabelText("Settings")).toBeTruthy();
    expect(screen.queryByText("Theme")).toBeNull();
    expect(screen.queryByText("System")).toBeNull();
  });

  it("navigates to Settings from the destination row", async () => {
    await renderInSafeArea(<AccountScreen />);

    fireEvent.press(screen.getByLabelText("Settings"));
    expect(mockPush).toHaveBeenCalledWith("/settings");
  });
});
