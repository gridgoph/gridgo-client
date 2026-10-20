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
    getRiderTracking: jest.fn(async () => ({ ping: null, tracking: null })),
    getFileDownloadUrl: jest.fn(),
    getFile: jest.fn(async () => { throw new Error("not in this test"); }),
    submitPayment: jest.fn(),
    acceptShopRecovery: jest.fn(async () => null),
    refundShopRecovery: jest.fn(async () => null),
    answerReschedule: jest.fn(),
    rematchReschedule: jest.fn(),
    refundReschedule: jest.fn(),
    // No handover credential unless a test gives one (gridgo-api#124/#125).
    getOrderHandover: jest.fn(async () => null),
    requestHubRedelivery: jest.fn(),
    escalateHandover: jest.fn(),
    // No post-order survey unless a test gives one (gridgo-api SURVEY_API.md).
    getOrderSurvey: jest.fn(async () => ({ serverTime: new Date().toISOString(), survey: null })),
    dismissOrderSurvey: jest.fn(),
    // "Track your order" (gridgo-api FOUNDING_TESTER_API.md): only for an eligible client.
    acknowledgeTesterTracking: jest.fn(async () => { throw new Error("not in this test"); }),
  };
}
