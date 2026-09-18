import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhenScreen from "@/app/request/when";
import { useJobDeadline } from "@/store/jobDeadline";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, deadlineDays: jest.fn() };
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

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ subcategory: "flyers", category: "marketing_collateral" }),
}));

/**
 * The date is a filter on which shops are offered, so what matters here is that
 * it reaches the match and that skipping it is a real answer rather than a
 * silently empty one.
 */
describe("WhenScreen", () => {
  beforeEach(() => {
    mockPush.mockReset();
    useJobDeadline.getState().clear();
    api.deadlineDays.mockReset();
    // Leave the answer hanging so these tests stay on the skeleton — a
    // resolved month is 126 cells and is not what the No-rush / Pick-a-date
    // cases are about.
    api.deadlineDays.mockImplementation(() => new Promise(() => {}));
  });

  it("lets a client say they are not in a hurry, and treats that as an answer", async () => {
    await renderInSafeArea(<WhenScreen />);

    fireEvent.press(screen.getByText("No rush — show me anyone"));

    // Answered, with no date: the match filters nobody out rather than being
    // handed a deadline the client never gave.
    expect(useJobDeadline.getState().answered).toBe(true);
    expect(useJobDeadline.getState().by).toBeNull();
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/request/match" }),
    );
  });

  it("will not go looking until a date is chosen, and says so on the control", async () => {
    // The button used to read "Find my printer" while doing nothing, which is
    // a control that looks broken. It names what is missing instead.
    await renderInSafeArea(<WhenScreen />);

    fireEvent.press(screen.getByText("Pick a date"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("says when nobody in the window can make it, without painting an error", async () => {
    api.deadlineDays.mockResolvedValue({ days: [], earliest: null });
    await renderInSafeArea(<WhenScreen />);

    expect(
      await screen.findByText(
        "No printer can make this within the next 120 days. Try No rush to see anyone.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Not this day")).toBeNull();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/#C62828|#B33A3A/i);
    expect(screen.queryByText(/could not check which dates/i)).toBeNull();
  });
});
