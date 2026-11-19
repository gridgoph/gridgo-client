import type { ExpressGuide, FoundingTester } from "@/lib/api";
import type { ProductCategory } from "@/lib/productCategories";
import { useCart } from "@/store/cart";
import { useExpressGuide } from "@/store/expressGuide";
import { useHomeSummary } from "@/store/homeSummary";
import { useSession } from "@/store/session";

/**
 * Home with GRIDGO's How to order flags (gridgo-client#441). A test file
 * mocks `expo-router` with `expressHomeRouter` and `@/lib/api` with
 * `expressHomeApiMock` (jest hoists mocks per file), then calls
 * `resetExpressHome` before each test.
 */

export const DOCS_TREE = [
  { code: "marketing_collateral", name: "Marketing & promotional collateral", subcategories: [] },
  { code: "document_publication", name: "Document & publication printing", subcategories: [] },
] as unknown as ProductCategory[];

export const guideFlags: { current: ExpressGuide } = {
  current: { missions: { added: false }, popupLastShownDate: null, guideSeen: false, guideCompleted: false, showPopup: true },
};

export function expressHomeRouter(push: (href: unknown) => void) {
  const router = { push, replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canDismiss: () => false, dismissAll: jest.fn() };
  return {
    router,
    useRouter: () => router,
    useFocusEffect: (effect: () => void) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useEffect } = require("react");
      useEffect(effect, [effect]);
    },
  };
}

export function expressHomeApiMock() {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listOrders: jest.fn(async () => []),
    productCategoriesNow: jest.fn(() => DOCS_TREE),
    getProductCategories: jest.fn(async () => DOCS_TREE),
    getCart: jest.fn(async () => null),
    getHomeSummary: jest.fn(async () => {
      throw new Error("offline");
    }),
    getFeaturedPrints: jest.fn(async () => ({ items: [] })),
    getExpressGuide: jest.fn(async () => guideFlags.current),
    updateExpressGuide: jest.fn(async () => ({ ...guideFlags.current, showPopup: false })),
  };
}

const TESTER: FoundingTester = {
  eligible: true,
  label: null,
  awardedAt: null,
  missions: { added: false, placed: false, tracked: false, received: false, rated: false },
  completedCount: 0,
  rewardStatus: "pending",
  reward: null,
};

export function resetExpressHome(patch: Partial<ExpressGuide> = {}) {
  guideFlags.current = {
    missions: { added: false },
    popupLastShownDate: null,
    guideSeen: false,
    guideCompleted: false,
    showPopup: true,
    ...patch,
  };
  useHomeSummary.getState().clear();
  useCart.getState().reset();
  useExpressGuide.getState().reset();
  useSession.setState({
    user: { id: "user_1", name: "Test Client", email: "client@example.com", role: "client", accountType: "personal", foundingTester: TESTER },
    token: "tok_test",
  } as never);
}
