import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useGridgoCharges } from "@/hooks/useGridgoCharges";
import { invalidate } from "@/lib/live";
import { usePlatformSettings } from "@/store/platformSettings";
import { useSession } from "@/store/session";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getSettings: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const SETTINGS = {
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

/*
  One test, because the hook writes to a store from an effect on mount, which
  spends this file's render budget (see AGENTS.md, "Running and testing"): a
  second `renderHook` here comes back with nothing in it. What a failed read
  does is the store's own test (`store/__tests__/platformSettings.test.ts`).
*/
it("reads GRIDGO's charges once a client is signed in, and again when GRIDGO says they changed", async () => {
  usePlatformSettings.getState().reset();
  useSession.setState({ user: null } as never);
  api.getSettings.mockReset();
  api.getSettings.mockResolvedValueOnce(SETTINGS);

  await renderHook(() => useGridgoCharges());
  expect(api.getSettings).not.toHaveBeenCalled();

  act(() => {
    useSession.setState({ user: { id: "client-a", role: "client" } as never });
  });
  await waitFor(() => expect(usePlatformSettings.getState().serviceFeeRateBps()).toBe(1000));
  expect(api.getSettings).toHaveBeenCalledTimes(1);

  api.getSettings.mockResolvedValueOnce({ ...SETTINGS, serviceFeeRateBps: 1500 });
  act(() => {
    invalidate("settings");
  });
  await waitFor(() => expect(usePlatformSettings.getState().serviceFeeRateBps()).toBe(1500));
});
