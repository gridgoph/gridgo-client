import { render, screen } from "@testing-library/react-native";

import { OptionGroupPicker } from "@/components/OptionGroupPicker";
import type { CatalogOptionGroup } from "@/lib/api";
import { usePlatformSettings } from "@/store/platformSettings";

const group: CatalogOptionGroup = {
  id: "finish", name: "Finish", kind: "addon", required: false,
  selectionMode: "single", sortOrder: 0, version: 1, helpText: null,
  options: [
    { id: "laminate", label: "Lamination", priceModifierMinor: 2000, specBinding: null, sortOrder: 0 },
    { id: "plain", label: "Plain", priceModifierMinor: 0, specBinding: null, sortOrder: 1 },
  ],
};

beforeEach(() => {
  usePlatformSettings.getState().reset();
});

/*
  The sheet's header moves by GRIDGO's price when an option is ticked, so the
  amount the option promises has to be GRIDGO's too: PHP 20.00 to the shop is
  PHP 22.00 to the client, and a row saying +PHP 20.00 next to a header that
  climbs by PHP 22.00 is a sum a client cannot make.
*/
it("prices an add-on at GRIDGO's figure, not the shop's", async () => {
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });

  await render(<OptionGroupPicker group={group} step={null} selectedId={undefined} onSelect={() => undefined} />);

  expect(screen.getByText("+₱22.00")).toBeTruthy();
  expect(screen.queryByText(/₱20\.00/)).toBeNull();
  expect(screen.getByLabelText("Lamination, Finish").props.accessibilityHint).toBe("Adds ₱22.00");
  expect(screen.getByText("Included")).toBeTruthy();
});
