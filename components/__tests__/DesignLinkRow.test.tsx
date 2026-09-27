import { render, screen } from "@testing-library/react-native";

import { ProductionSpecifications } from "@/components/ProductionSpecifications";
import type { Order } from "@/lib/api";

const ITEM = {
  id: "oli_1",
  itemName: "Flyers",
  quantity: 100,
  pricingUnit: null,
  packageQty: null,
  measurement: null,
  structuredSpec: {},
  options: [],
  artworkFileId: null,
  mockupFileId: null,
};

function order(productionItems: Order["productionItems"]): Order {
  return { id: "ord_1", title: "Flyers", quantity: 100, productionItems } as unknown as Order;
}

describe("design links on the order", () => {
  it("lists a saved design link under its item, as a link that opens it", async () => {
    await render(
      <ProductionSpecifications
        order={order([
          {
            ...ITEM,
            artworkLinks: [{ formatCode: "canva_link", url: "https://www.canva.com/design/DAF1/view" }],
          },
        ])}
      />,
    );

    expect(screen.getByText("Canva link")).toBeTruthy();
    expect(screen.getByText("canva.com/design/DAF1/view")).toBeTruthy();
    expect(
      screen.getByLabelText("Canva link: canva.com/design/DAF1/view. Opens outside GRIDGO."),
    ).toBeTruthy();
  });

  it("draws nothing extra for an order from an API without links", async () => {
    await render(<ProductionSpecifications order={order([ITEM])} />);

    expect(screen.queryByText("Canva link")).toBeNull();
    expect(screen.getByText("Flyers")).toBeTruthy();
  });
});
