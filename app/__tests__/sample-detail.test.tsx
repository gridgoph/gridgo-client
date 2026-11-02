import { screen } from "@testing-library/react-native";

import SampleBatchScreen from "@/app/samples/[id]";
import { renderScreen } from "@/test/renderScreen";
import { approvedBatch, expiredBatch, sampleBatch } from "@/test/sampleBatch";
import { useApproval } from "@/store/approval";
import { useSampleBatches } from "@/store/sampleBatches";

/**
 * One sample's screen shows the one thing to do at each stage (gridgo-api#222):
 * wait, decide, order the batch at the held or today's price, or order a new
 * sample after a rejection. Render-only: the presses live in their own files.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "sbd_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getSampleBatch: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  useSampleBatches.getState().reset();
  useApproval.setState({ samplePhotos: {} });
});

it("waits while the sample is made, with the batch saved", async () => {
  api.getSampleBatch.mockResolvedValue(sampleBatch());
  await renderScreen(<SampleBatchScreen />);
  expect(await screen.findByText("Sample on its way")).toBeTruthy();
  expect(screen.getByText("The batch price is held for 14 days after the sample arrives.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Approve the sample/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Open the sample order" })).toBeTruthy();
  expect(screen.getByText("500")).toBeTruthy();
});

it("asks for a photo and a tick before the sample can be approved", async () => {
  api.getSampleBatch.mockResolvedValue(sampleBatch({ sampleOrderState: "issue_window_open" }));
  await renderScreen(<SampleBatchScreen />);
  const approve = await screen.findByRole("button", { name: "Approve the sample" });
  expect(approve.props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByText("Add a photo of the sample to approve.")).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "This sample is right. Make my batch to match it." })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Something is wrong" })).toBeTruthy();
});

it("orders the batch at the held price by default, beside today's price", async () => {
  api.getSampleBatch.mockResolvedValue(approvedBatch());
  await renderScreen(<SampleBatchScreen />);
  const held = await screen.findByRole("radio", { name: /^Held price/ });
  expect(held.props.accessibilityState).toMatchObject({ checked: true, disabled: false });
  expect(screen.getByText("₱2,500.00")).toBeTruthy();
  expect(screen.getByText("₱3,000.00")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Order the batch at the held price" })).toBeTruthy();
  expect(screen.getByText(/keeps the specs of the sample you approved/)).toBeTruthy();
});

it("offers today's price once the hold has ended, and says why", async () => {
  api.getSampleBatch.mockResolvedValue(expiredBatch());
  await renderScreen(<SampleBatchScreen />);
  const held = await screen.findByRole("radio", { name: /^Held price/ });
  expect(held.props.accessibilityState).toMatchObject({ checked: false, disabled: true });
  expect(screen.getByRole("radio", { name: /^Today's price/ }).props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByText(/^The held price ended .+\. Today's price applies\.$/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Order the batch at today's price" })).toBeTruthy();
});

it("offers a new sample after a rejection that asked for one", async () => {
  api.getSampleBatch.mockResolvedValue(
    sampleBatch({
      status: "rejected",
      sampleOrderState: "completed",
      rejection: { version: 1, reason: "Too dark", next: "resample", at: "2026-11-02T00:00:00.000Z" },
    }),
  );
  await renderScreen(<SampleBatchScreen />);
  expect(await screen.findByRole("button", { name: "Order a new sample" })).toBeTruthy();
  expect(screen.getByText(/Too dark/)).toBeTruthy();
});

it("links both orders once the batch is ordered", async () => {
  api.getSampleBatch.mockResolvedValue(approvedBatch({ status: "ordered", batchOrderId: "ord_batch" }));
  await renderScreen(<SampleBatchScreen />);
  expect(await screen.findByText("Batch ordered")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Open the batch order" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Order the batch at/ })).toBeNull();
});
