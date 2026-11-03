import { act, renderHook } from "@testing-library/react-native";

import { useReorder } from "@/hooks/useReorder";
import { REQUEST_STEPPER_HREF } from "@/hooks/useStartRequest";
import type * as api from "@/lib/api";
import { useRequestDraft } from "@/store/requestDraft";

const mockNavigate = jest.fn();
const mockDismissTo = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: mockNavigate, dismissTo: mockDismissTo, push: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listCatalog: jest.fn(async () => []),
}));

/** A past marketplace job: no catalogue product, artwork and a drop-off. */
const PAST = {
  id: "ord_flyers",
  productId: null,
  title: "Flyers",
  quantity: 200,
  size: "",
  material: "",
  finish: null,
  address: "Sample drop-off",
  zone: "",
  artworkName: "flyer.pdf",
  artworkFileIds: ["file_flyer"],
  deadline: "2026-11-30T02:00:00.000Z",
  state: "completed",
} as unknown as api.Order;

beforeEach(() => {
  mockNavigate.mockClear();
  mockDismissTo.mockClear();
  useRequestDraft.getState().reset();
});

/*
 * The reported bug: tapping Reorder with no draft showed "Replace your draft
 * request with …?" and confirming did nothing. The first tap had already filled
 * the draft and asked the router to `dismissTo` the stepper, a POP_TO the tab
 * navigator ignores — so the client stayed on Home, and every later tap asked
 * to replace a draft they had never seen.
 */
describe("useReorder", () => {
  it("opens the reorder straight away when there is no draft", async () => {
    const { result } = await renderHook(() => useReorder());

    await act(() => result.current.reorder(PAST));

    expect(result.current.pendingLabel).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith(REQUEST_STEPPER_HREF);
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(useRequestDraft.getState()).toEqual(
      expect.objectContaining({ title: "Flyers", addressLine1: "Sample drop-off", artworkFileId: "file_flyer" }),
    );
  });

  it("asks first when the client has a draft of their own, and changes nothing yet", async () => {
    useRequestDraft.getState().patch({ title: "Birthday tarpaulin" });
    const { result } = await renderHook(() => useReorder());

    await act(() => result.current.reorder(PAST));

    expect(result.current.pendingLabel).toBe("Flyers");
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(useRequestDraft.getState().title).toBe("Birthday tarpaulin");
  });

  it("replaces the draft and opens the reorder when the client confirms", async () => {
    useRequestDraft.getState().patch({ title: "Birthday tarpaulin" });
    const { result } = await renderHook(() => useReorder());
    await act(() => result.current.reorder(PAST));

    await act(async () => result.current.confirmReplace());

    expect(result.current.pendingLabel).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith(REQUEST_STEPPER_HREF);
    expect(useRequestDraft.getState()).toEqual(
      expect.objectContaining({ title: "Flyers", artworkFileId: "file_flyer" }),
    );
  });

  it("keeps the draft and stays put when the client cancels", async () => {
    useRequestDraft.getState().patch({ title: "Birthday tarpaulin" });
    const { result } = await renderHook(() => useReorder());
    await act(() => result.current.reorder(PAST));

    await act(async () => result.current.cancelReplace());

    expect(result.current.pendingLabel).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(useRequestDraft.getState().title).toBe("Birthday tarpaulin");
  });

  it("does not ask to replace an untouched reorder with the same reorder", async () => {
    const { result } = await renderHook(() => useReorder());
    await act(() => result.current.reorder(PAST));
    useRequestDraft.getState().setStepIndex(1);
    mockNavigate.mockClear();

    await act(() => result.current.reorder(PAST));

    expect(result.current.pendingLabel).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith(REQUEST_STEPPER_HREF);
    // Opened where the client left it, not re-seeded back to the first step.
    expect(useRequestDraft.getState().stepIndex).toBe(1);
  });

  it("still asks once the client has changed the reorder", async () => {
    const { result } = await renderHook(() => useReorder());
    await act(() => result.current.reorder(PAST));
    useRequestDraft.getState().patch({ quantity: 500 });

    await act(() => result.current.reorder(PAST));

    expect(result.current.pendingLabel).toBe("Flyers");
    expect(useRequestDraft.getState().quantity).toBe(500);
  });
});
