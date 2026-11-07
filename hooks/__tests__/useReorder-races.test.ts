import { act, renderHook } from "@testing-library/react-native";

import { useReorder } from "@/hooks/useReorder";
import { useStartPrintJob } from "@/hooks/useStartPrintJob";
import { useJobFulfilment } from "@/store/jobFulfilment";
import { useReorderJob } from "@/store/reorderJob";
import { useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";
import { CURRENT_FLOW_ORDER, KEPT_FILE, NO_CODE_ORDER, REORDER_TREE, resetReorder } from "@/test/reorderFixtures";

const mockPush = jest.fn();

jest.mock("expo-router", () =>
  jest.requireActual("@/test/reorderFixtures").reorderRouter((href: unknown) => mockPush(href)),
);
jest.mock("@/lib/api", () => jest.requireActual("@/test/reorderFixtures").reorderApiMock());

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  resetReorder();
  mockPush.mockClear();
  api.getProductCategories.mockReset().mockResolvedValue(REORDER_TREE);
  api.getFile.mockReset().mockResolvedValue(KEPT_FILE);
});

/** A launch waiting on the product tree, from a hook whose screen may go away. */
async function pendingLaunch(order = CURRENT_FLOW_ORDER) {
  const tree = deferred<typeof REORDER_TREE>();
  api.getProductCategories.mockReturnValueOnce(tree.promise);
  const hook = await renderHook(() => ({ ...useReorder(), start: useStartPrintJob() }));
  let launch!: Promise<void>;
  await act(async () => {
    launch = hook.result.current.reorder(order);
  });
  const land = () =>
    act(async () => {
      tree.resolve(REORDER_TREE);
      await launch;
    });
  return { ...hook, land };
}

function switchAccount() {
  const previous = useSession.getState().user;
  useSession.setState({ user: null });
  useSession.setState({ user: { ...previous, id: "user_2", name: "Second account" } as never });
}

describe("a reorder lookup that lands late", () => {
  it("writes nothing and goes nowhere after a sign-out and another account", async () => {
    const { unmount, land } = await pendingLaunch();
    await unmount();
    await act(async () => switchAccount());

    await land();

    expect(useReorderJob.getState().job).toBeNull();
    expect(useJobFulfilment.getState().choice).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    expect(api.getFile).not.toHaveBeenCalled();
  });

  it("writes nothing after the same person signs out and back in", async () => {
    const { land } = await pendingLaunch();
    const user = useSession.getState().user;
    await act(async () => {
      useSession.setState({ user: null });
      useSession.setState({ user });
    });

    await land();

    expect(useReorderJob.getState().job).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does not take over a new print started meanwhile", async () => {
    const { result, land } = await pendingLaunch();
    await act(async () => result.current.start("signage", "tarpaulin"));
    useJobFulfilment.getState().set({ fulfillmentMode: "pickup", dropoff: null });

    await land();

    expect(useReorderJob.getState().job).toBeNull();
    expect(useJobFulfilment.getState().choice).toEqual({ fulfillmentMode: "pickup", dropoff: null });
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0].params.subcategory).toBe("tarpaulin");
  });

  it("gives way to a newer reorder", async () => {
    const { result, land } = await pendingLaunch();
    const newer = {
      ...CURRENT_FLOW_ORDER,
      productionItems: [{ ...CURRENT_FLOW_ORDER.productionItems![0], quantity: 17, subcategoryCode: "brochures" }],
    };
    await act(() => result.current.reorder(newer));

    await land();

    expect(useReorderJob.getState().job?.subcategory).toBe("brochures");
    expect(useReorderJob.getState().job?.answers.quantity).toBe(17);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("does not open the category screen once overtaken", async () => {
    const { result, land } = await pendingLaunch(NO_CODE_ORDER);
    await act(async () => result.current.start("signage", "tarpaulin"));
    mockPush.mockClear();

    await land();

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("still starts the job when nothing overtook it", async () => {
    const { land } = await pendingLaunch();

    await land();

    expect(useReorderJob.getState().job?.subcategory).toBe("flyers");
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(useRequestDraft.getState().title).toBe("");
  });
});

describe("a kept-file read that lands late", () => {
  const FILES = [{ fileId: "file_flyer", name: "flyer.pdf", contentType: "application/pdf" }];

  async function pendingFile() {
    const file = deferred<typeof KEPT_FILE>();
    api.getFile.mockReturnValueOnce(file.promise);
    const { result } = await renderHook(() => useReorder());
    await act(() => result.current.reorder(CURRENT_FLOW_ORDER));
    expect(useReorderJob.getState().job?.files).toBeNull();
    return () =>
      act(async () => {
        file.resolve(KEPT_FILE);
        await file.promise;
      });
  }

  it("still reaches its own job after the line was added", async () => {
    const land = await pendingFile();
    const jobs = useReorderJob.getState();
    jobs.update(jobs.job!.id, { lineId: "new_line" });

    await land();

    expect(useReorderJob.getState().job).toEqual(expect.objectContaining({ lineId: "new_line", files: FILES }));
  });

  it("never reaches a job that replaced it", async () => {
    const land = await pendingFile();
    const secondId = useReorderJob.getState().start({
      subcategory: "brochures",
      answers: useReorderJob.getState().job!.answers,
      files: null,
      lineId: null,
      artworkNote: null,
    });

    await land();

    expect(useReorderJob.getState().job).toEqual(expect.objectContaining({ id: secondId, files: null }));
  });

  it("is dropped after a change of account", async () => {
    const land = await pendingFile();
    await act(async () => switchAccount());

    await land();

    expect(useReorderJob.getState().job).toBeNull();
  });
});
