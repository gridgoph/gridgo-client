import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhenScreen from "@/app/request/when";
import type { Cart, CartLineRecord } from "@/lib/api";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";

const EARLIEST = "2026-09-23T12:00:00+08:00";

/**
 * The date's Continue names where it goes next. A basket that already settled
 * delivery or pick-up skips that question, so its Continue goes to Priorities;
 * the empty-basket branch ("Continue to Delivery") is in when-select. In its
 * own file because it presses (AGENTS.md).
 */

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
  // The first-order tour registers its screen on focus (`useTourScreen`).
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ subcategory: "flyers", category: "marketing_collateral" }),
}));

/** Every day of the next four months bookable, which is the ordinary case. */
function openDays(count = 120) {
  const out = [];
  const cursor = new Date();
  for (let index = 0; index < count; index += 1) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    out.push({ day: `${year}-${month}-${day}`, state: "open" as const });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, deadlineDays: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const HOME = { lat: 7.0731, lng: 125.6128, label: "Bajada, Davao City" };

const SETTLED: Cart = {
  id: "cart_1", state: "draft", version: 1, serviceLevel: "standard", scheduledFor: null,
  fulfillmentMode: "delivery", defaultDropoff: HOME,
  requestFulfillment: { fulfillmentMode: "delivery", dropoff: HOME },
  lines: [{ id: "cline_1", supplierId: "user_shop" } as CartLineRecord],
  checkedOutOrderId: null, createdAt: "2026-10-05T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z",
};

it("names Priorities on a basket that already settled how it travels", async () => {
  mockPush.mockReset();
  useJobDeadline.getState().clear();
  useCart.setState({ cartId: "cart_1", cart: SETTLED });
  api.deadlineDays.mockResolvedValue({ days: openDays(), earliest: EARLIEST });
  await renderInSafeArea(<WhenScreen />);

  await waitFor(() => expect(screen.getAllByLabelText(/: Secured$/).length).toBeGreaterThan(0));
  fireEvent.press(screen.getAllByLabelText(/: Secured$/)[0]);

  await waitFor(() => expect(screen.getByText("Continue to Priorities")).toBeTruthy());
  expect(screen.queryByText("Continue to Delivery")).toBeNull();
});
