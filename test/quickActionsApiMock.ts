/** `@/lib/api` for the "+" sheet's tests: nothing to show, nothing on the network. */
export function quickActionsApiMock() {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listOrders: jest.fn(async () => []),
    listCatalog: jest.fn(async () => []),
    getHomeSummary: jest.fn(async () => null),
    getSettings: jest.fn(async () => ({})),
  };
}
