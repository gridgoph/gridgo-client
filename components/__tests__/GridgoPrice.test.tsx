import { render, screen } from "@testing-library/react-native";

import { GridgoPrice, gridgoPriceLabel } from "@/components/GridgoPrice";
import { usePlatformSettings } from "@/store/platformSettings";

const SETTINGS = {
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

beforeEach(() => {
  usePlatformSettings.getState().reset();
});

describe("GridgoPrice", () => {
  it("draws the shop's figure at GRIDGO's price", async () => {
    usePlatformSettings.getState().adopt(SETTINGS);

    await render(<GridgoPrice supplierMinor={5000} className="text-h1 text-text-primary" />);

    expect(screen.getByText("₱55.00")).toBeTruthy();
    expect(screen.queryByText("₱50.00")).toBeNull();
  });

  it("keeps any words around the figure", async () => {
    usePlatformSettings.getState().adopt(SETTINGS);

    await render(<GridgoPrice supplierMinor={5000} prefix="From " suffix=" each" />);

    expect(screen.getByText("From ₱55.00 each")).toBeTruthy();
  });

  it("never draws the shop's figure while GRIDGO's rate is unread", async () => {
    await render(<GridgoPrice supplierMinor={5000} />);

    expect(screen.queryByText(/₱/)).toBeNull();
    expect(screen.getByLabelText("Price loading")).toBeTruthy();
  });

  it("says nothing at all for a price that does not exist", async () => {
    usePlatformSettings.getState().adopt(SETTINGS);

    await render(<GridgoPrice supplierMinor={null} />);

    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("gridgoPriceLabel", () => {
  it("spells the same figure for a screen reader", () => {
    expect(gridgoPriceLabel(5000, 1000)).toBe("₱55.00");
    expect(gridgoPriceLabel(5000, null)).toBe("price loading");
    expect(gridgoPriceLabel(null, 1000)).toBe("no price");
  });
});
