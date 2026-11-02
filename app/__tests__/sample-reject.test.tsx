import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import SampleBatchScreen from "@/app/samples/[id]";
import { renderScreen } from "@/test/renderScreen";
import { sampleBatch } from "@/test/sampleBatch";
import { useApproval } from "@/store/approval";
import { useSampleBatches } from "@/store/sampleBatches";

/** "Something is wrong" asks what and what next: a new sample or no batch (gridgo-api#222). */

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
  return { ...actual, getSampleBatch: jest.fn(), rejectSampleBatch: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  useSampleBatches.getState().reset();
  useApproval.setState({ samplePhotos: {} });
});

it("opens the rejection with a reason and the two ways on", async () => {
  api.getSampleBatch.mockResolvedValue(sampleBatch({ sampleOrderState: "delivered" }));
  await renderScreen(<SampleBatchScreen />);

  fireEvent.press(await screen.findByRole("button", { name: "Something is wrong" }));

  expect(await screen.findByLabelText("What is wrong with the sample")).toBeTruthy();
  expect(screen.getByRole("radio", { name: /^Order a new sample/ })).toBeTruthy();
  expect(screen.getByRole("radio", { name: /^Cancel the batch/ })).toBeTruthy();
  // Nothing is sent until there is a reason and a choice.
  expect(screen.getByRole("button", { name: "Reject the sample" }).props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.queryByRole("button", { name: "Approve the sample" })).toBeNull();
  expect(api.rejectSampleBatch).not.toHaveBeenCalled();
});
