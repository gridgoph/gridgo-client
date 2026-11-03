import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import SampleBatchScreen from "@/app/samples/[id]";
import { renderScreen } from "@/test/renderScreen";
import { sampleBatch } from "@/test/sampleBatch";
import { useApproval } from "@/store/approval";
import { useSampleBatches } from "@/store/sampleBatches";

/**
 * Approving is a tick and the client's photo of the sample (gridgo-api#222).
 * Two presses, so the only test in its file.
 */

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
  return { ...actual, getSampleBatch: jest.fn(), approveSampleBatch: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  useSampleBatches.getState().reset();
  useApproval.setState({
    samplePhotos: {
      "sample-batch:sbd_1": { phase: "stored", fileName: "sample.jpg", localUri: "file:///sample.jpg", fileId: "file_photo", error: null },
    },
  });
});

it("approves with the tick and the stored photo", async () => {
  const arrived = sampleBatch({ sampleOrderState: "issue_window_open" });
  api.getSampleBatch.mockResolvedValue(arrived);
  api.approveSampleBatch.mockResolvedValue({ ...arrived, status: "approved" });
  await renderScreen(<SampleBatchScreen />);

  fireEvent.press(await screen.findByRole("checkbox", { name: "This sample is right. Make my batch to match it." }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Approve the sample" }).props.accessibilityState).toMatchObject({ disabled: false }),
  );
  fireEvent.press(screen.getByRole("button", { name: "Approve the sample" }));

  await waitFor(() => expect(api.approveSampleBatch).toHaveBeenCalledWith("sbd_1", { samplePhotoFileId: "file_photo" }));
  await waitFor(() => expect(useSampleBatches.getState().byId.sbd_1?.status).toBe("approved"));
});
