/**
 * Module factories for the group screen tests, required from inside each
 * file's own `jest.mock` (a factory cannot close over imports).
 */
export const groupScreenMocks = {
  router: () => {
    const { useEffect } = jest.requireActual("react");
    const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
    return {
      Stack: { Screen: () => null },
      useLocalSearchParams: () => ({ id: "grp_1" }),
      useRouter: () => router,
      useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    };
  },
  api: () => ({
    ...jest.requireActual("@/lib/api"),
    getExpressGroup: jest.fn(),
    getExpressGroupTracking: jest.fn(),
    reviewExpressGroup: jest.fn(),
  }),
};
