import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import ApproveSampleScreen from "@/app/order/approve-sample";
import type { ApprovalProofRead } from "@/lib/api";
import { useApproval } from "@/store/approval";
import { renderScreen } from "@/test/renderScreen";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ orderId: "ord_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getApprovalProof: jest.fn(), transitionOrder: jest.fn() };
});
jest.mock("@/lib/signatureUpload", () => ({ uploadSignature: jest.fn(async () => "file_signature") }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const SIGNATURE = { width: 300, height: 180, strokes: [[{ x: 10, y: 100 }, { x: 200, y: 40 }]] };
const REVIEW: ApprovalProofRead = {
  requirement: { version: 1, required: true, method: "drawn" },
  approvalProofs: [],
  review: {
    snapshot: { items: [{ id: "oli_1", itemNameSnapshot: "Event banner", quantity: 1, artworkFileId: "file_art" }], artwork: [{ fileId: "file_art", originalFilename: "banner.pdf" }] },
    snapshotSha256: "review-digest",
  },
};

beforeEach(() => {
  api.getApprovalProof.mockResolvedValue(REVIEW);
  useApproval.setState({ drafts: {}, samplePhotos: {}, uploaded: {} });
});

// gridgo-client#248: a sample is approved with a signature and a photo of it.
it("shows what is approved and holds the approval until there is a photo and a signature", async () => {
  await renderScreen(<ApproveSampleScreen />);
  expect(await screen.findByText("Event banner")).toBeTruthy();
  expect(screen.getByText("banner.pdf")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add a photo of the sample" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign to approve" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Approve and continue" }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText("Add a photo of the sample to approve.")).toBeTruthy();
});

// Presses, so last in the file (AGENTS.md).
it("sends the signature, the photo and the review fingerprint with the decision", async () => {
  useApproval.getState().sign("order:ord_1", "review-digest", SIGNATURE);
  useApproval.setState({
    samplePhotos: { "order:ord_1": { phase: "stored", fileName: "sample.jpg", localUri: "file://sample.jpg", fileId: "file_photo", error: null } },
  });
  api.transitionOrder.mockResolvedValue({ id: "ord_1", state: "approved_for_matching" });
  await renderScreen(<ApproveSampleScreen />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Approve and continue" }).props.accessibilityState.disabled).toBe(false),
  );

  await fireEvent.press(screen.getByRole("button", { name: "Approve and continue" }));

  await waitFor(() => expect(api.transitionOrder).toHaveBeenCalled());
  expect(api.transitionOrder).toHaveBeenCalledWith("ord_1", "approved_for_matching", {
    note: "Approved by client",
    approval: {
      accepted: true,
      method: "drawn",
      signatureFileId: "file_signature",
      samplePhotoFileId: "file_photo",
      expectedSnapshotSha256: "review-digest",
      device: expect.objectContaining({ platform: "ios" }),
    },
  });
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
});
