import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { placedBasket } from "@/test/multiShopFixtures";
import { groupOrder, renderPhone } from "@/test/multiShopOrderScreen";

const mockSetParams = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true, setParams: mockSetParams }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "ord_b" }),
  useFocusEffect: (effect: () => void) => {
    // Required inside the factory: jest.mock is hoisted above imports.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getOrder: jest.fn(),
    // No handover credential: an order made ready before the switch (gridgo-api#125).
    getOrderHandover: jest.fn(async () => null),
    getBasket: jest.fn(),
    getTaxonomy: jest.fn(async () => ({ categories: [], materials: [], finishes: [] })),
    listCatalog: jest.fn(async () => []),
    listZones: jest.fn(async () => []),
    listOrderRefunds: jest.fn(async () => []),
    getSettings: jest.fn(async () => ({ issueWindowHours: 24, serviceFeeRateBps: 1000, deliveryFeeBands: [] })),
    getFileDownloadUrl: jest.fn(async () => {
      throw new Error("no file");
    }),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

afterEach(async () => {
  await cleanup();
});

// One press per file: see "Running and testing" in AGENTS.md.
it("opens another shop group in the same order view", async () => {
  api.getOrder.mockResolvedValue(groupOrder());
  api.getBasket.mockResolvedValue(placedBasket());
  await renderPhone(<OrderDetailScreen />);

  await fireEvent.press(await screen.findByLabelText("Shop C. In production."));

  expect(mockSetParams).toHaveBeenCalledWith({ id: "ord_c" });
});
