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
    expect(screen.getByLabelText("Grand opening tarpaulin, In production")).toBeTruthy();
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
