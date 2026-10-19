import { fireEvent, screen } from "@testing-library/react-native";

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
it("keeps the report and its screenshot when an upload fails, and sends nothing", async () => {
  pickerReturns(mockGetDocumentAsync, ["blank.png"]);
  mockUpload.mockImplementation(() => ({
    done: Promise.reject(new TypeError("Network request failed")),
    cancel: jest.fn(),
  }));
  await renderScreen(<ReportProblemScreen />);
  await writeReport();

  fireEvent.press(screen.getByLabelText("Add screenshot"));
  expect(await screen.findByLabelText("Screenshot 1")).toBeTruthy();
  fireEvent.press(screen.getByText("Send to Operations"));

  expect(await screen.findByText("Not sent")).toBeTruthy();
  expect(screen.getByText(/did not upload/)).toBeTruthy();
  expect(mockSend).not.toHaveBeenCalled();
  expect(screen.getByLabelText("What happened").props.value).toBe("I tapped Pay and the screen went blank.");
  expect(screen.getByLabelText("Screenshot 1")).toBeTruthy();
  expect(screen.getByText("Send to Operations")).toBeTruthy();
});
