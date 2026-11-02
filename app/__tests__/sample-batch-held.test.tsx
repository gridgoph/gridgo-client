import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import SampleBatchScreen from "@/app/samples/[id]";
import { renderScreen } from "@/test/renderScreen";
import { approvedBatch } from "@/test/sampleBatch";
import { voucherCart } from "@/test/checkoutVoucherHarness";
import { useCart } from "@/store/cart";
import { useSampleBatches } from "@/store/sampleBatches";

/** "Order the batch now" opens the batch in its own basket and goes to checkout (gridgo-api#222). */

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "sbd_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getSampleBatch: jest.fn(), createSampleBatchCart: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  useSampleBatches.getState().reset();
  useCart.getState().reset();
});

it("orders the batch at the held price while the hold lasts", async () => {
  api.getSampleBatch.mockResolvedValue(approvedBatch());
  api.createSampleBatchCart.mockResolvedValue({ ...voucherCart(), id: "cart_batch" });
  await renderScreen(<SampleBatchScreen />);

  fireEvent.press(await screen.findByRole("button", { name: "Order the batch at the held price" }));

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/checkout"));
  expect(api.createSampleBatchCart).toHaveBeenCalledWith("sbd_1", { pricing: "held", quantity: 500 });
  expect(useCart.getState().cartId).toBe("cart_batch");
});
