import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import ReportProblemScreen from "@/app/report-problem";
import { renderScreen } from "@/test/renderScreen";
import {
  REPORT_DEVICE,
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
it("sends one screenshot with the report", async () => {
  pickerReturns(mockGetDocumentAsync, ["blank.png"]);
  await renderScreen(<ReportProblemScreen />);
  await writeReport();

  fireEvent.press(screen.getByLabelText("Add screenshot"));
  expect(await screen.findByLabelText("Screenshot 1")).toBeTruthy();
  fireEvent.press(screen.getByText("Send to Operations"));

  await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(mockUpload.mock.calls[0][0]).toMatchObject({ uri: "file:///cache/blank.png", name: "blank.png" });
  expect(mockUpload.mock.calls[0][1]).toBe("support_chat_image");
  const [body, threadId, options] = mockSend.mock.calls[0];
  expect(body).toContain(`App: ${REPORT_DEVICE.app}`);
  expect(threadId).toBeUndefined();
  expect(options).toEqual({ newThread: true, attachmentFileIds: ["file_blank.png"] });
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/chat/[thread]", params: { thread: REPORT_THREAD_ID } }),
  );
});
