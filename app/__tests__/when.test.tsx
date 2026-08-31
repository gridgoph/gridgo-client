import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhenScreen from "@/app/request/when";
import { useJobDeadline } from "@/store/jobDeadline";

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

  it("will not go looking until a date is chosen", async () => {
    await renderInSafeArea(<WhenScreen />);

    fireEvent.press(screen.getByText("Find my printer"));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
