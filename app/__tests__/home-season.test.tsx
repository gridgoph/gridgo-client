import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import { addDays, davaoToday, type SeasonWindow } from "@/lib/seasonWindows";
import { useCart } from "@/store/cart";
import { useRequestDraft } from "@/store/requestDraft";
import { useSeasonWindows } from "@/store/seasonWindows";
import { useSession } from "@/store/session";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listOrders: jest.fn(async () => []),
    listCatalog: jest.fn(async () => []),
    getProductCategories: jest.fn(async () => []),
    getCart: jest.fn(async () => null),
    getSeasonWindows: jest.fn(),
  };
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

/** A season five weeks out, so today sits inside its six-to-four-week banner. */
function upcoming(): SeasonWindow {
  const today = davaoToday();
  const startDate = addDays(today, 35);
  return {
    id: "sea_school",
    name: "School season",
    startDate,
    endDate: addDays(startDate, 14),
    demandLevel: "Peak",
    message: "Plan your printing early.",
    banner: { startDate: addDays(startDate, -42), endDate: addDays(startDate, -28) },
  };
}

beforeEach(() => {
  useCart.getState().reset();
  useRequestDraft.getState().reset();
  useSession.setState({
    user: { id: "user_1", name: "Rina Cruz", email: "rina@example.com", role: "client", accountType: "personal" },
    token: "tok_test",
  } as never);
  const window = upcoming();
  const seasons = { windows: [window], banners: [window] };
  api.getSeasonWindows.mockResolvedValue(seasons);
  useSeasonWindows.setState({ seasons, readAt: Date.now(), dismissed: [], hydrated: true });
});

it("shows the season's heads-up on Home, in words and with its level", async () => {
  await renderInSafeArea(<HomeScreen />);

  expect(await screen.findByText("School season starts in 5 weeks")).toBeTruthy();
  expect(screen.getByText("Plan your printing early.")).toBeTruthy();
  expect(screen.getByText("Peak")).toBeTruthy();
});

it("leaves a season this phone has dismissed off Home", async () => {
  useSeasonWindows.setState({ dismissed: ["sea_school"] });
  await renderInSafeArea(<HomeScreen />);

  expect(await screen.findByText("START YOUR FIRST PRINT")).toBeTruthy();
  expect(screen.queryByText("School season starts in 5 weeks")).toBeNull();
});

it("holds the banner until the phone has read its dismissals back", async () => {
  useSeasonWindows.setState({ hydrated: false });
  await renderInSafeArea(<HomeScreen />);

  expect(await screen.findByText("START YOUR FIRST PRINT")).toBeTruthy();
  expect(screen.queryByText("School season starts in 5 weeks")).toBeNull();
});

// Presses, so it goes last in the file (see AGENTS.md on testing-library and React 19).
it("puts the banner away when dismissed and remembers that season", async () => {
  await renderInSafeArea(<HomeScreen />);

  fireEvent.press(await screen.findByLabelText("Dismiss the School season notice"));

  expect(useSeasonWindows.getState().dismissed).toEqual(["sea_school"]);
  await screen.findByText("START YOUR FIRST PRINT");
  expect(screen.queryByText("School season starts in 5 weeks")).toBeNull();
});
