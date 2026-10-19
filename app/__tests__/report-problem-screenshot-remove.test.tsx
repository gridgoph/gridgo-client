import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import ReportProblemScreen from "@/app/report-problem";
import { renderScreen } from "@/test/renderScreen";
import {
  REPORT_THREAD_ID,
  pickerReturns,
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
it("removes a screenshot before sending", async () => {
  pickerReturns(mockGetDocumentAsync, ["a.png", "b.png"]);
  await renderScreen(<ReportProblemScreen />);

  fireEvent.press(screen.getByLabelText("Add screenshot"));
  expect(await screen.findByLabelText("Screenshot 2")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Remove screenshot 1"));

  await waitFor(() => expect(screen.queryByLabelText("Screenshot 2")).toBeNull());
  expect(screen.getByLabelText("Screenshot 1").props.source).toEqual({ uri: "file:///cache/b.png" });
  expect(screen.getByLabelText("Add screenshot")).toBeTruthy();
  expect(mockUpload).not.toHaveBeenCalled();
});
