import { screen } from "@testing-library/react-native";

import ExpressOrderRoute from "@/app/express/order/[id]";
import * as api from "@/lib/api";
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
  getSettings: jest.fn(async () => ({ deliveryFeeBands: [] })),
}));

// gridgo-client#449: A3 is paid after the shop accepts, inside five minutes.
it("asks for payment with the time left once the A3 shop accepts", async () => {
  jest.mocked(api.getOrder).mockResolvedValue(acceptedA3Order());
  await renderScreen(<ExpressOrderRoute />);
  expect(await screen.findByText("Pay now to keep this price and start printing.")).toBeTruthy();
  expect(screen.getByText(/^4:[23]\d left to pay$/)).toBeTruthy();
  expect(screen.getByText("Pay in full")).toBeTruthy();
  expect(screen.getByText("₱240.00")).toBeTruthy();
});
