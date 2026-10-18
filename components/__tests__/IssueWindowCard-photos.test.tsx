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
    reportIssue: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const order = {
  id: "ord_window_3",
  state: "issue_window_open",
  title: "Trade fair flyers",
  issueWindowOpenedAt: new Date(Date.now() - 3_600_000).toISOString(),
  issueWindowExpiresAt: new Date(Date.now() + 20 * 3_600_000).toISOString(),
  timeline: [],
} as unknown as Order;

it("will not send a report without a photo, and says so", async () => {
  useSurvey.setState({ reportIntent: order.id });
  // Another order's photo is not this report's.
  useProblemReport.setState({
    orderId: "ord_other",
    photos: [{ key: "x", phase: "stored", fileName: "x.jpg", localUri: null, fileId: "file_x", progress: 1, error: null }],
  });
  await renderInSafeArea(<IssueWindowCard order={order} onUpdated={jest.fn()} />);

  expect(await screen.findByText("Add a photo")).toBeTruthy();
  expect(screen.queryByText("x.jpg")).toBeNull();
  fireEvent.changeText(screen.getByLabelText("Describe the issue"), "Colour is washed out across all 200 flyers.");
  expect(await screen.findByText("Add at least one photo that shows what is wrong.")).toBeTruthy();
  await waitFor(() => expect(screen.getByRole("button", { name: "Send this to Operations" })).toBeDisabled());
  expect(api.reportIssue).not.toHaveBeenCalled();
});
