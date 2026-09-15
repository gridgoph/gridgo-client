import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { IssueWindowCard } from "@/components/IssueWindowCard";
import type { Order } from "@/lib/api";

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

const order: Order = {
  id: "ord_window_1",
  clientId: "user_client",
  supplierId: "user_supplier",
  riderId: "user_rider",
  state: "issue_window_open",
  productId: "prod_flyers",
  title: "Trade fair flyers",
  quantity: 200,
  size: "A5",
  material: "matte_150gsm",
  deadline: null,
  address: "12 J.P. Laurel Ave, Bajada, Davao City",
  zone: "davao_central",
  subtotalMinor: 110000,
  deliveryFeeMinor: 2500,
  totalMinor: 112500,
  downpaymentMinor: 84375,
  balanceMinor: 28125,
  paymentMethod: "qr_manual",
  paymentStatus: "paid",
  promisedDate: null,
  artworkName: "flyers.pdf",
  issueWindowOpenedAt: new Date(Date.now() - HOUR).toISOString(),
  issueWindowExpiresAt: new Date(Date.now() + 23 * HOUR + 60_000).toISOString(),
  createdAt: "2026-08-08T10:00:00+08:00",
  updatedAt: "2026-08-11T16:12:00+08:00",
  timeline: [],
};

describe("IssueWindowCard", () => {
  beforeEach(() => {
    api.confirmDelivery.mockReset();
    api.listIssues.mockResolvedValue([]);
  });

  it("leads with the good ending and keeps the report as the quieter choice", async () => {
    await render(<IssueWindowCard order={order} onUpdated={jest.fn()} />);

    expect(await screen.findByText(/Is everything okay\?/)).toBeTruthy();
    expect(screen.getByText(/within 24 hours of delivery/)).toBeTruthy();
    expect(screen.getByText("Everything is fine")).toBeTruthy();
    expect(screen.getByText("Report a problem")).toBeTruthy();
    expect(api.confirmDelivery).not.toHaveBeenCalled();
  });

  // Two presses, so this test stays last in the file (see AGENTS.md, testing).
  it("closes the job only once the question is answered, and hands the finished order back", async () => {
    const closed: Order = { ...order, state: "completed" };
    api.confirmDelivery.mockResolvedValue(closed);
    const onUpdated = jest.fn();

    await render(<IssueWindowCard order={order} onUpdated={onUpdated} />);
    await screen.findByText("Everything is fine");

    fireEvent.press(screen.getByText("Everything is fine"));
    expect(await screen.findByText("Close Trade fair flyers as fine?")).toBeTruthy();
    expect(screen.getByText("Not yet")).toBeTruthy();
    // Asking is not closing.
    expect(api.confirmDelivery).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("Yes, everything is fine"));

    await waitFor(() => expect(api.confirmDelivery).toHaveBeenCalledWith("ord_window_1"));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(closed));
  });
});
