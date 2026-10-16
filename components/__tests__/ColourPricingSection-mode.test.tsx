import { fireEvent, render, screen } from "@testing-library/react-native";

import { ColourPricingSection } from "@/components/ColourPricingSection";
import type { CartLineRecord } from "@/lib/api";

it("saves the copies-or-sets choice on the tap", async () => {
  const onQuantityMode = jest.fn();
  const line = {
    id: "cline_1",
    quantity: 3,
    quantityMode: null,
    listing: { pricedByColour: true },
    documentPages: { total: 12, range: null, printed: 12 },
    colourPricing: {
      version: 1, status: "quantity_mode_required", pricedByColour: true, quantityMode: null, quantity: 3,
      totalSheets: null, warning: null, pages: [],
    },
  } as unknown as CartLineRecord;
  await render(
    <ColourPricingSection line={line} saving={false} onQuantityMode={onQuantityMode} onQuantity={jest.fn()} onRetry={jest.fn()} retrying={false} />,
  );
  fireEvent.press(screen.getByLabelText(/^Sets of the whole document/));
  expect(onQuantityMode).toHaveBeenCalledWith("document_sets");
});
