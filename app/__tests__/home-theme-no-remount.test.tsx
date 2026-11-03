import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import { ThemeTransitionHost } from "@/components/ThemeTransitionHost";
import { useCart } from "@/store/cart";
import { usePlatformSettings } from "@/store/platformSettings";
import { useSession } from "@/store/session";
import { useThemeStore } from "@/store/theme";
import { useThemeSwitch } from "@/store/themeSwitch";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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
    getProductCategories: jest.fn(async () => []),
    getCart: jest.fn(async () => null),
    getHomeSummary: jest.fn(async () => null),
    getFeaturedPrints: jest.fn(),
    saveAccountThemePreference: jest.fn(async (value: string) => value),
  };
});

/** Every Featured photo that mounts: a remount is a fresh download on a phone. */
const mockPhotoMounts: string[] = [];
jest.mock("expo-image", () => {
  const actual = jest.requireActual("expo-image");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement, useEffect } = require("react");
  function CountedImage(props: { source?: { uri?: string } }) {
    useEffect(() => {
      mockPhotoMounts.push(props.source?.uri ?? "");
      // eslint-disable-next-line react-hooks/exhaustive-deps -- counts mounts only
    }, []);
    return createElement(actual.Image, props);
  }
  return { ...actual, Image: CountedImage };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const LINK = "https://files.example.test/file_1?sig=a";

beforeEach(() => {
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
  api.getFeaturedPrints.mockResolvedValue({
    title: "FEATURED PRINTS",
    items: [
      {
        id: "sci_flyers",
        name: "Flyers",
        categoryCode: "marketing_collateral",
        subcategoryCode: "flyers",
        clientFromPriceMinor: 49_500,
        pricingUnit: "per_unit",
        packageQty: null,
        measureUnit: null,
        minimumOrderQuantity: null,
        photos: [
          {
            fileId: "file_1",
            sortOrder: 0,
            url: "/catalog/media/file_1",
            downloadUrl: LINK,
            downloadUrlExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          },
        ],
      },
    ],
    emptyState: null,
  });
  useCart.getState().reset();
  useSession.setState({
    user: { id: "user_1", name: "Rina Cruz", email: "rina@example.com", role: "client", accountType: "business" },
    token: "tok_test",
  } as never);
});

/*
  A theme switch repaints Home; it must not rebuild it. The Featured photo
  mounts once, is never fetched again, and the list is not re-read.
*/
it("keeps Home's Featured photo mounted across a theme switch", async () => {
  useThemeStore.setState({ preference: "light", unsynced: false, owner: "user_1" });
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <HomeScreen />
      <ThemeTransitionHost />
    </SafeAreaProvider>,
  );
  await screen.findByTestId("sample-photo-image");
  expect(mockPhotoMounts).toEqual([LINK]);

  const veils: unknown[] = [];
  const stop = useThemeSwitch.subscribe((state, previous) => {
    if (state.veil !== previous.veil) veils.push(state.veil);
  });
  fireEvent.press(await screen.findByLabelText("Dark theme"));

  // The wash rises over Home, the theme lands behind it, and it clears.
  await waitFor(() => expect(useThemeStore.getState().preference).toBe("dark"));
  await waitFor(() => expect(useThemeSwitch.getState().wanted).toBeNull());
  stop();
  expect(veils).toEqual([{ to: "dark", phase: "in" }, { to: "dark", phase: "out" }, null]);

  expect(mockPhotoMounts).toEqual([LINK]);
  expect(api.getFeaturedPrints).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("sample-photo-image").props.source?.[0]?.uri).toBe(LINK);
});
