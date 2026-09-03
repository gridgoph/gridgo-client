import { fireEvent, render, screen } from "@testing-library/react-native";

import { HomeActionRow, HomeJobRow } from "@/components/HomeRow";
import type { Order } from "@/lib/api";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "user_client",
    supplierId: null,
    riderId: null,
    state: "submitted",
    productId: "prod_tarpaulin",
    title: "Grand opening tarpaulin",
    quantity: 1,
    size: "3x6 ft",
    material: "13oz tarpaulin",
    deadline: null,
    address: "JP Laurel Ave, Davao City",
    zone: "davao_central",
    subtotalMinor: 110000,
    deliveryFeeMinor: 2500,
    totalMinor: 112500,
    downpaymentMinor: 84375,
    balanceMinor: 28125,
    paymentMethod: "qr_manual",
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
    timeline: [],
    ...overrides,
  };
}

describe("HomeActionRow", () => {
  it("leads with the next verb, not the job's money or spec", async () => {
    await render(
      <HomeActionRow order={order({ state: "proof_approval" })} onPress={() => undefined} />,
    );

    expect(screen.getByText("Approve your artwork proof")).toBeTruthy();
    expect(screen.getByText("Grand opening tarpaulin")).toBeTruthy();
    expect(screen.queryByText(/₱/)).toBeNull();
    expect(screen.queryByText(/Qty/)).toBeNull();
    expect(
      screen.getByLabelText("Approve your artwork proof, Grand opening tarpaulin"),
    ).toBeTruthy();
  });
});

describe("HomeJobRow", () => {
  it("names the job and the human status, never the platform state", async () => {
    await render(<HomeJobRow order={order({ state: "production" })} onPress={() => undefined} />);

    expect(screen.getByText("Grand opening tarpaulin")).toBeTruthy();
    expect(screen.getByText("In production")).toBeTruthy();
    expect(screen.queryByText("production")).toBeNull();
    expect(screen.queryByText(/₱/)).toBeNull();
    expect(screen.queryByText(/Qty/)).toBeNull();
    expect(screen.getByLabelText("Grand opening tarpaulin, In production")).toBeTruthy();
  });

  /**
   * The one question a job that needs nothing has to answer: where is it.
   * Coarse on purpose — the chip beside it still carries the precise state.
   */
  it("shows how far along the job is, on the delivery rail", async () => {
    await render(<HomeJobRow order={order({ state: "production" })} onPress={() => undefined} />);

    expect(screen.getByLabelText("Stage 2 of 4: Printing")).toBeTruthy();
    expect(screen.getByText("Delivered")).toBeTruthy();
    expect(screen.queryByText("Counter")).toBeNull();
  });

  it("sends a collecting client to the counter, not out for delivery", async () => {
    await render(
      <HomeJobRow
        order={order({ state: "picked_up", fulfillmentMode: "pickup" })}
        onPress={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Stage 3 of 4: To office")).toBeTruthy();
    expect(screen.getByText("Counter")).toBeTruthy();
    expect(screen.queryByText("Delivered")).toBeNull();
  });

  /** An invented position is worse than none. */
  it("draws no rail for a state this app does not know", async () => {
    await render(<HomeJobRow order={order({ state: "on_hold" })} onPress={() => undefined} />);

    expect(screen.getByText("Grand opening tarpaulin")).toBeTruthy();
    expect(screen.queryByText("Printing")).toBeNull();
  });
});

describe("HomeActionRow tap", () => {
  it("opens on tap", async () => {
    const onPress = jest.fn();
    await render(<HomeActionRow order={order({ state: "client_correction" })} onPress={onPress} />);

    fireEvent.press(screen.getByLabelText("Replace the artwork, Grand opening tarpaulin"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
