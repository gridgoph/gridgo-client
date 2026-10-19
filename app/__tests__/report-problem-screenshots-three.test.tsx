import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import ReportProblemScreen from "@/app/report-problem";
import { renderScreen } from "@/test/renderScreen";
import {
  REPORT_THREAD_ID,
  pickerReturns,
  writeReport,
} from "@/test/reportProblemHarness";

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));

jest.mock("@/lib/bugReport", () => ({
  ...jest.requireActual("@/lib/bugReport"),
  currentDevice: () => jest.requireActual("@/test/reportProblemHarness").REPORT_DEVICE,
}));

const mockGetDocumentAsync = jest.fn();
jest.mock("@/lib/nativeModules", () => ({
  getDocumentPickerNative: () => ({ getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args) }),
}));

const mockSend = jest.fn();
const mockUpload = jest.fn();
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listOrders: () => Promise.resolve([]),
  sendSupportChatMessage: (...args: unknown[]) => mockSend(...args),
  uploadFile: (...args: unknown[]) => mockUpload(...args),
}));

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ thread: { id: REPORT_THREAD_ID }, message: { id: "msg_1" } });
  mockUpload.mockReset();
  mockUpload.mockImplementation((asset: { name: string }) => ({
    done: Promise.resolve({ fileId: `file_${asset.name}` }),
    cancel: jest.fn(),
  }));
});

// Two presses spend the file, so this is its only test.
it("takes three screenshots, offers no fourth, and sends all three", async () => {
  pickerReturns(mockGetDocumentAsync, ["a.png", "b.png", "c.png"]);
  await renderScreen(<ReportProblemScreen />);
  await writeReport();

  fireEvent.press(screen.getByLabelText("Add screenshot"));
  expect(await screen.findByLabelText("Screenshot 3")).toBeTruthy();
  expect(screen.queryByLabelText("Add screenshot")).toBeNull();
  expect(screen.getByText("Up to 3. Only GRIDGO Operations see them.")).toBeTruthy();
  fireEvent.press(screen.getByText("Send to Operations"));

  await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
  expect(mockUpload).toHaveBeenCalledTimes(3);
  expect(mockSend.mock.calls[0][2]).toEqual({
    newThread: true,
    attachmentFileIds: ["file_a.png", "file_b.png", "file_c.png"],
  });
});
