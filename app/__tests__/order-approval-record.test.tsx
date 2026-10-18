import { screen } from "@testing-library/react-native";

import ApprovalRecordScreen from "@/app/order/approval";
import type { ApprovalProofRead, ApprovalProofRecord } from "@/lib/api";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ orderId: "ord_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getApprovalProof: jest.fn(), getFileDownloadUrl: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const SIGNED: ApprovalProofRecord = {
  id: "apr_1",
  version: 1,
  phase: "checkout",
  status: "approved",
  method: "drawn",
  at: "2026-10-18T06:30:00.000Z",
  account: { id: "u", name: "Sample Client" },
  device: { id: "client-x", platform: "web", appVersion: "1.0.0" },
  statement: "I approve this order",
  signatureFileId: "file_sig",
  samplePhotoFileId: null,
  snapshot: {
    items: [{ id: "oli_1", itemNameSnapshot: "Event shirts", quantity: 20, artworkFileId: "file_art", options: [{ optionLabelSnapshot: "Large" }] }],
    artwork: [{ fileId: "file_art", originalFilename: "shirt-front.png" }],
  },
  snapshotSha256: "9f2c1a7be4d05c3388aa",
};

function read(records: ApprovalProofRecord[]): ApprovalProofRead {
  return {
    requirement: { version: 1, required: false, method: "drawn" },
    approvalProofs: records,
    // The current review has moved on; the record must not follow it.
    review: { snapshot: { items: [{ id: "oli_1", itemNameSnapshot: "Renamed shirts", quantity: 99 }] }, snapshotSha256: "new" },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  api.getFileDownloadUrl.mockResolvedValue({ fileId: "file_sig", url: "https://files.example/sig.png", expiresAt: "", expiresInSeconds: 300 });
});

it("shows what was approved as it was frozen, with the signature, who and when", async () => {
  api.getApprovalProof.mockResolvedValue(read([SIGNED]));
  await renderScreen(<ApprovalRecordScreen />);

  expect(await screen.findByText("Order approval")).toBeTruthy();
  expect(screen.getByText("Signed")).toBeTruthy();
  expect(screen.getByText('"I approve this order"')).toBeTruthy();
  expect(screen.getByText("Sample Client")).toBeTruthy();
  expect(screen.getByText("web · version 1.0.0")).toBeTruthy();
  expect(screen.getByText("WHAT YOU APPROVED")).toBeTruthy();
  expect(screen.getByText("Event shirts")).toBeTruthy();
  expect(screen.getByText("Quantity 20")).toBeTruthy();
  expect(screen.getByText("shirt-front.png")).toBeTruthy();
  expect(screen.queryByText("Renamed shirts")).toBeNull();
  expect(screen.getByText("Record fingerprint 9F2C 1A7B E4D0 5C33")).toBeTruthy();
  expect(await screen.findByLabelText("Your signature")).toBeTruthy();
  expect(api.getFileDownloadUrl).toHaveBeenCalledWith("file_sig");
  expect(screen.getByRole("button", { name: "Download approval record (PDF)" })).toBeTruthy();
});

it("says plainly when no approval was collected", async () => {
  api.getApprovalProof.mockResolvedValue(
    read([{ ...SIGNED, status: "legacy_unrecorded", method: null, statement: null, signatureFileId: null, device: null }]),
  );
  await renderScreen(<ApprovalRecordScreen />);

  expect(await screen.findByText("No approval recorded")).toBeTruthy();
  expect(screen.getByText("No approval was collected when this order was placed. GRIDGO kept a copy of what was ordered.")).toBeTruthy();
  expect(screen.getByText("What GRIDGO kept of this order when it was placed.")).toBeTruthy();
  expect(screen.getByText("WHAT WAS ORDERED")).toBeTruthy();
  expect(screen.queryByText("Signed")).toBeNull();
  expect(screen.queryByText('"I approve this order"')).toBeNull();
  expect(api.getFileDownloadUrl).not.toHaveBeenCalled();
});
