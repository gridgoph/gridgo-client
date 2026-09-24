import type { Order } from "@/lib/api";
import { HOME_FINISHED_LIMIT, HOME_IN_PROGRESS_LIMIT, homeJobs, isFinishedOrderState } from "@/lib/homeJobs";

function order(id: string, state: string, overrides: Partial<Order> = {}): Order {
  return {
    id,
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    state,
    productId: "prod_tarpaulin",
    title: id,
    quantity: 1,
    size: "3x6 ft",
    material: "13oz tarpaulin",
    deadline: null,
    address: "JP Laurel Ave",
    zone: "davao_central",
    subtotalMinor: 110000,
    deliveryFeeMinor: 2500,
    totalMinor: 112500,
    downpaymentMinor: 84375,
    balanceMinor: 28125,
    paymentMethod: "qr_manual",
    paymentStatus: "downpayment_confirmed",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-08T10:00:00+08:00",
    updatedAt: "2026-08-09T10:00:00+08:00",
    timeline: [],
    ...overrides,
  };
}

const ids = (orders: Order[]) => orders.map((o) => o.id);

describe("homeJobs", () => {
  it("splits jobs into waiting on the client, in progress and finished", () => {
    const jobs = homeJobs([
      order("done", "completed"),
      order("printing", "production"),
      order("proof", "proof_approval"),
      order("arrived", "delivered"),
      order("riding", "out_for_delivery"),
      order("check", "issue_window_open"),
    ]);

    expect(ids(jobs.needsYou)).toEqual(["proof", "check"]);
    expect(ids(jobs.inProgress)).toEqual(["printing", "riding"]);
    expect(ids(jobs.finished)).toEqual(["done", "arrived"]);
  });

  it("keeps every waiting job but caps the other two groups", () => {
    const orders = [
      ...Array.from({ length: 5 }, (_, i) => order(`wait${i}`, "client_correction")),
      ...Array.from({ length: 5 }, (_, i) => order(`live${i}`, "production")),
      ...Array.from({ length: 5 }, (_, i) => order(`done${i}`, "completed")),
    ];
    const jobs = homeJobs(orders);

    expect(jobs.needsYou).toHaveLength(5);
    expect(ids(jobs.inProgress)).toEqual(["live0", "live1", "live2"].slice(0, HOME_IN_PROGRESS_LIMIT));
    expect(jobs.inProgressTotal).toBe(5);
    expect(jobs.finished).toHaveLength(HOME_FINISHED_LIMIT);
  });

  it("treats a state it does not know as live, never as finished", () => {
    expect(ids(homeJobs([order("mystery", "on_hold")]).inProgress)).toEqual(["mystery"]);
  });

  it("puts a job on the office counter with the client, not with finished work", () => {
    const jobs = homeJobs([order("counter", "awaiting_collection", { fulfillmentMode: "pickup" })]);
    expect(ids(jobs.needsYou)).toEqual(["counter"]);
    expect(jobs.finished).toHaveLength(0);
  });

  it("names only the end states as finished", () => {
    expect(["delivered", "completed", "payout_released"].every(isFinishedOrderState)).toBe(true);
    expect(isFinishedOrderState("out_for_delivery")).toBe(false);
    expect(isFinishedOrderState("issue_window_open")).toBe(false);
  });
});
