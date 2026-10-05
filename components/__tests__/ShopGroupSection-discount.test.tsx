import { render, screen } from "@testing-library/react-native";

import { ShopGroupSection } from "@/components/ShopGroupSection";
import type { ShopGroupView } from "@/lib/basketGroups";

const GROUP: ShopGroupView = {
  id: "g1",
  label: "Shop A",
  letter: "A",
  lines: [],
  itemsMinor: 11000,
  deliveryFeeMinor: 5000,
  totalMinor: 15500,
  organizationDiscountMinor: 500,
  zone: null,
  distanceKm: null,
};

it("draws an organization's discount under its own shop group, never GRIDGO's fee", async () => {
  await render(
    <ShopGroupSection group={GROUP} pickup={false} busy={false} onAddMore={() => undefined}>
      {null}
    </ShopGroupSection>,
  );
  expect(screen.getByLabelText("Organization discount on Shop A, minus ₱5.00")).toBeTruthy();
  expect(screen.getByText("−₱5.00")).toBeTruthy();
  expect(screen.queryByText(/service fee/i)).toBeNull();
});
