import { screen } from "@testing-library/react-native";

import ExpressOrderRoute from "@/app/express/order/[id]";
import * as api from "@/lib/api";
import { HOME_PICKUP_STREET_PENDING } from "@/lib/homePrinter";
import { acceptedA3Order } from "@/test/expressOrderA3";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  const router = { push: jest.fn(), replace: jest.fn(), canGoBack: () => true };
  return {
    Stack: { Screen: () => null },
    useLocalSearchParams: () => ({ id: "order_a3" }),
    useRouter: () => router,
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: () => undefined }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
  listOrderRefunds: jest.fn(async () => []),
}));

// gridgo-api#412 (0B10F8DE): a home printer's order shows the barangay, then the street once paid — never a map.

function homeOrder(pickup: Record<string, unknown>, status = "printing", fulfillmentMode = "pickup") {
  const order = acceptedA3Order({ status, paymentTiming: "checkout", payBy: null }, "production");
  return { ...order, fulfillmentMode, printerType: "home", barangay: "Poblacion District", verificationLevel: "verified", pickup } as api.Order;
}

it("holds the street back until payment is confirmed, with no map or directions", async () => {
  jest.mocked(api.getOrder).mockResolvedValue(homeOrder({ barangay: "Poblacion District" }));
  await renderScreen(<ExpressOrderRoute />);
  expect(await screen.findByText("The home printer in Poblacion District is printing your files.")).toBeTruthy();
  expect(screen.getByText("Home printer in Poblacion District")).toBeTruthy();
  expect(screen.getByText(HOME_PICKUP_STREET_PENDING)).toBeTruthy();
  expect(screen.queryByText("Directions")).toBeNull();
});

it("shows the street, and only the street, once the pickup is paid", async () => {
  jest.mocked(api.getOrder).mockResolvedValue(
    homeOrder({ barangay: "Poblacion District", street: "Test Street Uno" }, "ready"),
  );
  await renderScreen(<ExpressOrderRoute />);
  expect(await screen.findByText("Show this code at the home printer in Poblacion District.")).toBeTruthy();
  expect(screen.getByText("Test Street Uno, Poblacion District")).toBeTruthy();
  expect(screen.queryByText(HOME_PICKUP_STREET_PENDING)).toBeNull();
  expect(screen.queryByText("Directions")).toBeNull();
});
