import { screen } from "@testing-library/react-native";

import SamplesScreen from "@/app/samples/index";
import { renderScreen } from "@/test/renderScreen";
import { approvedBatch, expiredBatch, sampleBatch } from "@/test/sampleBatch";
import { useSampleBatches } from "@/store/sampleBatches";

/** My samples says where each sample stands and how long its price is held (gridgo-api#222). */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, listSampleBatches: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => useSampleBatches.getState().reset());

it("labels each sample's stage and its price hold", async () => {
  api.listSampleBatches.mockResolvedValue([
    sampleBatch({ id: "s1" }),
    sampleBatch({ id: "s2", sampleOrderState: "issue_window_open" }),
    approvedBatch({ id: "s3" }),
    expiredBatch({ id: "s4", itemName: "Stickers" }),
    sampleBatch({ id: "s5", status: "ordered", batchOrderId: "ord_batch" }),
    sampleBatch({ id: "s6", status: "cancelled" }),
  ]);
  await renderScreen(<SamplesScreen />);

  expect(await screen.findByText("Sample on its way")).toBeTruthy();
  expect(screen.getByText("Check your sample")).toBeTruthy();
  expect(screen.getAllByText("Approved")).toHaveLength(2);
  expect(screen.getByText("Batch ordered")).toBeTruthy();
  expect(screen.getByText("Cancelled")).toBeTruthy();
  // Not delivered yet: the clock has not started.
  expect(screen.getAllByText("The batch price is held for 14 days after the sample arrives.")).toHaveLength(2);
  expect(screen.getByText(/^Held price until .+ days left\.$/)).toBeTruthy();
  expect(screen.getByText(/^Held price ended /)).toBeTruthy();
});

it("says plainly when there are no samples", async () => {
  api.listSampleBatches.mockResolvedValue([]);
  await renderScreen(<SamplesScreen />);
  expect(await screen.findByText("No samples yet")).toBeTruthy();
});
