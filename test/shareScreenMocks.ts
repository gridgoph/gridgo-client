/**
 * What every share-card screen test needs. Call from inside `jest.mock`
 * factories only through `require`, since `jest.mock` is hoisted.
 */
export function shareApiMock() {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getOrderShare: jest.fn(),
    prepareOrderShare: jest.fn(),
    recordShareCard: jest.fn(),
    recordShareTap: jest.fn(),
  };
}

export function shareStoryMock() {
  return {
    captureStory: jest.fn(async () => "iVBORw0KGgo="),
    shareStory: jest.fn(async () => ({ kind: "shared", linkCopied: false })),
    shareLink: jest.fn(async () => ({ kind: "shared", linkCopied: false })),
    sharesPictureWithoutText: jest.fn(() => false),
  };
}
