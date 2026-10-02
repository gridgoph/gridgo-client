import type { screen as Screen } from "@testing-library/react-native";

import type { PlatformSettings } from "@/lib/api";
import { usePlatformSettings } from "@/store/platformSettings";

/** GRIDGO's charges with Operations' fee switch set either way. */
export function feeSettings(visible: boolean, overrides: Partial<PlatformSettings> = {}): PlatformSettings {
  return {
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [
      { maxDistanceMeters: 4999, feeMinor: 2500 },
      { maxDistanceMeters: 10000, feeMinor: 5000 },
      { maxDistanceMeters: null, feeMinor: 7500 },
    ],
    serviceFeeVisibleToClient: visible,
    ...overrides,
  };
}

/** Hold those charges in the shared store, as `useGridgoCharges` would at sign-in. */
export function setServiceFeeSwitch(visible: boolean): void {
  usePlatformSettings.setState({ settings: feeSettings(visible) });
}

/**
 * With the switch off a client sees no sign that a service fee exists: no
 * row, no explainer, no wording, no rate. A fee rate reads like "10%" or
 * "12.5%", so any percentage on a fee-free screen is a leak.
 */
export function expectNoServiceFee(screen: typeof Screen): void {
  expect(screen.queryAllByText(/service fee/i)).toHaveLength(0);
  expect(screen.queryAllByLabelText(/service fee/i)).toHaveLength(0);
  expect(screen.queryAllByText(/improving app operations/i)).toHaveLength(0);
  expect(screen.queryAllByText(/\d+(\.\d+)?\s*%/)).toHaveLength(0);
  expect(screen.queryAllByLabelText(/\d+(\.\d+)?\s*%/)).toHaveLength(0);
}
