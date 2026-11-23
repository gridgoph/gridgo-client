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
}));

it("offers a calm re-pick after an A3 decline, with no payment asked", async () => {
  jest.mocked(api.getOrder).mockResolvedValue(
    acceptedA3Order({ status: "cancelled", repickRequired: true, payBy: null }, "cancelled"),
  );
  await renderScreen(<ExpressOrderRoute />);
  expect(await screen.findByText("Pick another printer")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Pick a printer" })).toBeTruthy();
  expect(screen.queryByText("Pay in full")).toBeNull();
});

it("says the window closed when payBy passed with nothing sent", async () => {
  jest.mocked(api.getOrder).mockResolvedValue(acceptedA3Order({ payBy: new Date(Date.now() - 1000).toISOString() }));
  await renderScreen(<ExpressOrderRoute />);
  expect(await screen.findByText("Time to pay ran out")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Pick a printer" })).toBeTruthy();
});
