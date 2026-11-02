import { cleanup, render, screen } from "@testing-library/react-native";

import { BasketGroupsCard } from "@/components/BasketGroupsCard";
import { DATE_EARLY, DATE_LATE, placedBasket } from "@/test/multiShopFixtures";
import { refundOrder } from "@/test/refundFixtures";

afterEach(async () => {
  await cleanup();
});

// gridgo-api#275: a shop sent separately is one order per delivery.
it("says which of a shop's deliveries each order is", async () => {
  const placed = placedBasket(["production", "production", "production"]);
  const basket = {
    ...placed,
    deadline: null,
    groups: [
      { ...placed.groups[0], label: "Shop A", deadline: DATE_EARLY, deliveryNumber: 1, shopDeliveryCount: 2 },
      { ...placed.groups[1], label: "Shop A", deadline: DATE_LATE, deliveryNumber: 2, shopDeliveryCount: 2 },
    ],
  };
  const order = refundOrder({ id: "ord_a", basketId: basket.id, groupLabel: "Shop A", deliveryNumber: 1, shopDeliveryCount: 2 });

  await render(<BasketGroupsCard order={order} basket={basket} onSelect={jest.fn()} />);

  expect(screen.getByText("Shop A, delivery 1 of 2")).toBeTruthy();
  expect(screen.getByText("Shop A, delivery 2 of 2")).toBeTruthy();
});

it("leaves a shop delivering once as it was", async () => {
  const basket = placedBasket();
  const order = refundOrder({ id: "ord_a", basketId: basket.id, groupLabel: "Shop A" });

  await render(<BasketGroupsCard order={order} basket={basket} onSelect={jest.fn()} />);

  expect(screen.getByText("Shop A")).toBeTruthy();
  expect(screen.queryByText(/delivery \d of \d/)).toBeNull();
});
