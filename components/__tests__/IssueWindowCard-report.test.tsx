import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { IssueWindowCard } from "@/components/IssueWindowCard";
import type { Order } from "@/lib/api";
import { useProblemReport } from "@/store/problemReport";
import { useSurvey } from "@/store/survey";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listIssues: jest.fn(async () => []),
    getSettings: jest.fn(async () => ({ issueWindowHours: 24, deliveryFeeBands: [] })),
    confirmDelivery: jest.fn(),
    reportIssue: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const HOUR = 60 * 60 * 1000;

const order = {
  id: "ord_window_2",
  state: "issue_window_open",
  title: "Trade fair flyers",
  issueWindowOpenedAt: new Date(Date.now() - HOUR).toISOString(),
  issueWindowExpiresAt: new Date(Date.now() + 23 * HOUR).toISOString(),
  timeline: [],
} as unknown as Order;

const stored = (key: string, fileId: string) => ({
  key, phase: "stored" as const, fileName: `${fileId}.jpg`, localUri: null, fileId, progress: 1, error: null,
});

// A typed description and two presses spend the file (see AGENTS.md), so this is its only test.
it("sends the problem type, the client's words and the uploaded photos — and nothing of the case file", async () => {
  api.reportIssue.mockResolvedValue({ issue: { id: "iss_new" } });
  useSurvey.setState({ reportIntent: order.id });
  useProblemReport.setState({ orderId: order.id, photos: [stored("p1", "file_photo_1"), stored("p2", "file_photo_2")] });
  await renderInSafeArea(<IssueWindowCard order={order} onUpdated={jest.fn()} />);

  expect(await screen.findByText("Send this to Operations")).toBeTruthy();
  expect(screen.getByText(/Operations reviews your photos with what GRIDGO recorded on this job/)).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText("Describe the issue"), "Colour is washed out across all 200 flyers.");
  await waitFor(() =>
    expect(screen.getByLabelText("Describe the issue").props.value).toBe("Colour is washed out across all 200 flyers."),
  );
  fireEvent.press(screen.getByText("Send this to Operations"));
  fireEvent.press(await screen.findByText("Send report"));

  await waitFor(() => expect(api.reportIssue).toHaveBeenCalledTimes(1));
  expect(api.reportIssue).toHaveBeenCalledWith("ord_window_2", {
    problemType: "material_quality",
    description: "Colour is washed out across all 200 flyers.",
    photoFileIds: ["file_photo_1", "file_photo_2"],
  });
  await waitFor(() => expect(useProblemReport.getState().photos).toEqual([]));
});
