/**
 * The mocks every order-screen render needs. Call from inside `jest.mock`
 * factories only through `require`, since `jest.mock` is hoisted.
 */
export function orderScreenApiMock() {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getOrder: jest.fn(),
    listOrderRefunds: jest.fn(),
    getTaxonomy: jest.fn(async () => ({ categories: [], materials: [], finishes: [] })),
    listCatalog: jest.fn(async () => []),
    listZones: jest.fn(async () => []),
    listIssues: jest.fn(async () => []),
    getSettings: jest.fn(async () => ({ issueWindowHours: 24, deliveryFeeBands: [] })),
    getRiderLocation: jest.fn(async () => null),
    getFileDownloadUrl: jest.fn(),
    getFile: jest.fn(async () => { throw new Error("not in this test"); }),
    submitPayment: jest.fn(),
  };
}
