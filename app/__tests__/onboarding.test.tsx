import { fireEvent, render, screen } from "@testing-library/react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OnboardingScreen from "@/app/onboarding";
import { onboardingSteps } from "@/data/onboarding";
import { usePriorities } from "@/store/priorities";

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
let mockParams: { returnTo?: string | string[] } = {};

jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    back: (...args: unknown[]) => mockBack(...args),
    canGoBack: () => mockCanGoBack(),
  },
  useLocalSearchParams: () => mockParams,
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

/*
 * One press per test, and pressing tests after the ones that only read: see
 * AGENTS.md "Running and testing" — a second press empties later renders.
 */
describe("OnboardingScreen", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockBack.mockClear();
    mockCanGoBack.mockReturnValue(false);
    mockParams = {};
    usePriorities.setState({ ranking: null, loaded: true, saving: false, saveError: null });
    jest.mocked(Location.requestForegroundPermissionsAsync).mockClear();
    jest.mocked(Location.getForegroundPermissionsAsync).mockClear();
    jest.mocked(Notifications.requestPermissionsAsync).mockClear();
  });

  it("lays the pages out in the #159 order: tracking, notifications, then the ranking last", async () => {
    await renderInSafeArea(<OnboardingScreen />);

    const headings = screen
      .getAllByRole("header", { includeHiddenElements: true })
      .map((node) => node.props.children);
    expect(headings).toEqual(onboardingSteps.map((step) => step.title));
    expect(headings[0]).toBe("Watch it come to you");
    expect(headings[1]).toBe("Know when your job moves");
    expect(headings[headings.length - 1]).toBe("What matters most on a print job?");
  });

  it("opens on the tracking preview with a Next button and the step count", async () => {
    await renderInSafeArea(<OnboardingScreen />);

    expect(screen.getByText("01 / 06")).toBeTruthy();
    expect(screen.getByText("Next")).toBeTruthy();
    expect(screen.getByLabelText("Skip to your ranking")).toBeTruthy();
  });

  it("asks for no location and raises no notification dialog on its own", async () => {
    await renderInSafeArea(<OnboardingScreen />);

    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText(/address|street|location/i)).toBeNull();
  });

  it("draws the ranking board on the last page, with nothing pre-ranked", async () => {
    await renderInSafeArea(<OnboardingScreen />);

    for (const label of ["Quality", "Speed", "Cost", "Distance"]) {
      const card = screen.getByLabelText(label, { includeHiddenElements: true });
      expect(card.props.accessibilityValue.text).toBe("Not ranked");
    }
  });

  it("does not let an unranked client skip out — Skip goes to the ranking", async () => {
    await renderInSafeArea(<OnboardingScreen />);
    fireEvent.press(screen.getByLabelText("Skip to your ranking"));

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("returns to Settings when a ranked client skips a replay", async () => {
    usePriorities.setState({ ranking: ["quality", "speed", "cost", "distance"] });
    mockParams = { returnTo: "settings" };
    mockCanGoBack.mockReturnValue(true);

    await renderInSafeArea(<OnboardingScreen />);
    fireEvent.press(screen.getByLabelText("Skip onboarding"));

    expect(mockReplace).toHaveBeenCalledWith("/settings");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("replaces to the launcher when a ranked client skips with no history", async () => {
    usePriorities.setState({ ranking: ["quality", "speed", "cost", "distance"] });
    mockCanGoBack.mockReturnValue(false);

    await renderInSafeArea(<OnboardingScreen />);
    fireEvent.press(screen.getByLabelText("Skip onboarding"));

    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(mockBack).not.toHaveBeenCalled();
  });
});
