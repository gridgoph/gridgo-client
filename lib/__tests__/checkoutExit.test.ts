import { ApiError, type CheckoutExitPrompt } from "@/lib/api";
import {
  CHECKOUT_EXIT_OTHER_MAX,
  DEFAULT_CHECKOUT_EXIT_OPTIONS,
  exitAnswerErrorMessage,
  exitOptionsFrom,
  exitQuestionCanShow,
  noteCheckoutVisit,
  offersOther,
  oneTapOptions,
  otherTextProblem,
} from "@/lib/checkoutExit";
import { useCheckoutExit } from "@/store/checkoutExit";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    recordCheckoutVisit: jest.fn(),
    claimCheckoutExitPrompt: jest.fn(),
    answerCheckoutExitPrompt: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const PROMPT: CheckoutExitPrompt = {
  id: "cxp_1",
  question: "What stopped you from ordering?",
  status: "unanswered",
  reachedAt: "2026-10-16T07:40:00.000Z",
  askedAt: "2026-10-16T09:00:00.000Z",
  answeredAt: null,
  skippedAt: null,
  reason: null,
  otherText: null,
};

const DUE = { serverTime: "2026-10-16T09:00:00.000Z", options: DEFAULT_CHECKOUT_EXIT_OPTIONS, prompt: PROMPT };

const CLEAR = {
  ready: true,
  signedIn: true,
  onTabs: true,
  legalClear: true,
  updateShowing: false,
  pushExplainerOpen: false,
  tourShowing: false,
  callActive: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  useCheckoutExit.getState().reset();
});

describe("the question's options", () => {
  it("offers six one-tap answers and Other", () => {
    const options = exitOptionsFrom(DUE.options);
    expect(oneTapOptions(options).map((option) => option.code)).toEqual([
      "price_too_high",
      "delivery_cost_or_time",
      "still_deciding",
      "payment_problem",
      "found_another_option",
      "just_browsing",
    ]);
    expect(offersOther(options)).toBe(true);
  });

  it("falls back to the known list when a read carries none", () => {
    expect(exitOptionsFrom(undefined)).toEqual(DEFAULT_CHECKOUT_EXIT_OPTIONS);
    expect(exitOptionsFrom([])).toEqual(DEFAULT_CHECKOUT_EXIT_OPTIONS);
  });

  it("asks for 1 to 500 characters for Other", () => {
    expect(otherTextProblem("   ")).not.toBeNull();
    expect(otherTextProblem("Needed it by Friday")).toBeNull();
    expect(otherTextProblem("x".repeat(CHECKOUT_EXIT_OTHER_MAX))).toBeNull();
    expect(otherTextProblem("x".repeat(CHECKOUT_EXIT_OTHER_MAX + 1))).not.toBeNull();
  });

  it("words GRIDGO's refusals", () => {
    expect(exitAnswerErrorMessage(new ApiError(400, { error: "invalid_checkout_exit_note" }))).toMatch(/between 1 and 500/);
    expect(exitAnswerErrorMessage(new Error("offline"))).toMatch(/did not reach GRIDGO/);
  });
});

describe("when it may be shown", () => {
  it("only on a clear tab shell", () => {
    expect(exitQuestionCanShow(CLEAR)).toBe(true);
  });

  it.each([
    ["the intro is playing", { ready: false }],
    ["signed out", { signedIn: false }],
    ["off the tab shell (checkout, a survey, sign-in)", { onTabs: false }],
    ["terms are waiting", { legalClear: false }],
    ["the update prompt is up", { updateShowing: true }],
    ["the notification explainer is up", { pushExplainerOpen: true }],
    ["the tour is showing", { tourShowing: true }],
    ["a call is on", { callActive: true }],
  ])("never while %s", (_why, patch) => {
    expect(exitQuestionCanShow({ ...CLEAR, ...patch })).toBe(false);
  });
});

describe("the checkout visit", () => {
  it("is fire and forget: a refusal is swallowed", async () => {
    api.recordCheckoutVisit.mockRejectedValue(new ApiError(409, { error: "cart_checked_out" }));
    expect(() => noteCheckoutVisit("cart_1")).not.toThrow();
    await Promise.resolve();
    expect(api.recordCheckoutVisit).toHaveBeenCalledWith("cart_1");
  });
});

describe("the question's store", () => {
  it("claims once per app open and holds what GRIDGO hands over", async () => {
    api.claimCheckoutExitPrompt.mockResolvedValue(DUE);
    await useCheckoutExit.getState().claim();
    await useCheckoutExit.getState().claim();
    expect(api.claimCheckoutExitPrompt).toHaveBeenCalledTimes(1);
    expect(useCheckoutExit.getState().prompt?.id).toBe("cxp_1");
    expect(useCheckoutExit.getState().open).toBe(false);
  });

  it("holds nothing when nothing is due, and asks again on the next open", async () => {
    api.claimCheckoutExitPrompt.mockResolvedValue({ serverTime: DUE.serverTime, prompt: null, nextEligibleAt: null });
    await useCheckoutExit.getState().claim();
    expect(useCheckoutExit.getState().prompt).toBeNull();
    await useCheckoutExit.getState().claim();
    expect(api.claimCheckoutExitPrompt).toHaveBeenCalledTimes(1);

    useCheckoutExit.getState().resume();
    await useCheckoutExit.getState().claim();
    expect(api.claimCheckoutExitPrompt).toHaveBeenCalledTimes(2);
  });

  it("stays quiet when GRIDGO cannot be reached", async () => {
    api.claimCheckoutExitPrompt.mockRejectedValue(new Error("offline"));
    await expect(useCheckoutExit.getState().claim()).resolves.toBeUndefined();
    expect(useCheckoutExit.getState().prompt).toBeNull();
  });

  it("sends a one-tap answer and thanks", async () => {
    api.claimCheckoutExitPrompt.mockResolvedValue(DUE);
    api.answerCheckoutExitPrompt.mockResolvedValue({ serverTime: DUE.serverTime, prompt: { ...PROMPT, status: "answered" } });
    await useCheckoutExit.getState().claim();
    useCheckoutExit.getState().show();

    await expect(useCheckoutExit.getState().answer("price_too_high")).resolves.toBe(true);
    expect(api.answerCheckoutExitPrompt).toHaveBeenCalledWith("cxp_1", { reason: "price_too_high" });
    expect(useCheckoutExit.getState().sent).toBe(true);

    useCheckoutExit.getState().finish();
    expect(useCheckoutExit.getState().open).toBe(false);
    expect(useCheckoutExit.getState().prompt).toBeNull();
  });

  it("sends Other with its trimmed words, and refuses it empty without calling GRIDGO", async () => {
    api.claimCheckoutExitPrompt.mockResolvedValue(DUE);
    api.answerCheckoutExitPrompt.mockResolvedValue({ serverTime: DUE.serverTime, prompt: PROMPT });
    await useCheckoutExit.getState().claim();

    useCheckoutExit.getState().setOtherText("   ");
    await expect(useCheckoutExit.getState().sendOther()).resolves.toBe(false);
    expect(api.answerCheckoutExitPrompt).not.toHaveBeenCalled();
    expect(useCheckoutExit.getState().error).not.toBeNull();

    useCheckoutExit.getState().setOtherText("  Needed it by Friday ");
    await expect(useCheckoutExit.getState().sendOther()).resolves.toBe(true);
    expect(api.answerCheckoutExitPrompt).toHaveBeenCalledWith("cxp_1", { reason: "other", otherText: "Needed it by Friday" });
  });

  it("skips on GRIDGO's side and closes at once", async () => {
    api.claimCheckoutExitPrompt.mockResolvedValue(DUE);
    api.answerCheckoutExitPrompt.mockRejectedValue(new Error("offline"));
    await useCheckoutExit.getState().claim();
    useCheckoutExit.getState().show();

    useCheckoutExit.getState().skip();
    expect(api.answerCheckoutExitPrompt).toHaveBeenCalledWith("cxp_1", { skip: true });
    expect(useCheckoutExit.getState().open).toBe(false);
    expect(useCheckoutExit.getState().prompt).toBeNull();
  });

  it("keeps the question up with a reason when an answer does not go through", async () => {
    api.claimCheckoutExitPrompt.mockResolvedValue(DUE);
    api.answerCheckoutExitPrompt.mockRejectedValue(new Error("offline"));
    await useCheckoutExit.getState().claim();
    useCheckoutExit.getState().show();

    await expect(useCheckoutExit.getState().answer("still_deciding")).resolves.toBe(false);
    expect(useCheckoutExit.getState().open).toBe(true);
    expect(useCheckoutExit.getState().error).toMatch(/did not reach GRIDGO/);
  });

  it("forgets a prompt claimed for an account that has since signed out", async () => {
    let finish: (value: typeof DUE) => void = () => undefined;
    api.claimCheckoutExitPrompt.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const pending = useCheckoutExit.getState().claim();
    useCheckoutExit.getState().reset();
    finish(DUE);
    await pending;
    expect(useCheckoutExit.getState().prompt).toBeNull();
  });
});
