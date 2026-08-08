import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OnboardingScreen from "@/app/onboarding";
import { onboardingSlides } from "@/data/onboarding";

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

describe("OnboardingScreen", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockBack.mockClear();
    mockCanGoBack.mockReturnValue(false);
    mockParams = {};
  });

  it("renders skip, first slide copy, and the primary CTA", async () => {
    await renderInSafeArea(<OnboardingScreen />);

    expect(screen.getByText("Skip")).toBeTruthy();
    expect(screen.getByText(onboardingSlides[0].title)).toBeTruthy();
    expect(screen.getByText(onboardingSlides[0].cta)).toBeTruthy();
  });

  it("returns to Settings when skip is pressed with returnTo=settings", async () => {
    mockParams = { returnTo: "settings" };
    mockCanGoBack.mockReturnValue(true);

    await renderInSafeArea(<OnboardingScreen />);
    fireEvent.press(screen.getByText("Skip"));

    expect(mockReplace).toHaveBeenCalledWith("/settings");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("replaces to the launcher when skip is pressed with no history", async () => {
    mockCanGoBack.mockReturnValue(false);

    await renderInSafeArea(<OnboardingScreen />);
    fireEvent.press(screen.getByText("Skip"));

    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(mockBack).not.toHaveBeenCalled();
  });
});
