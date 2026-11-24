import * as api from "@/lib/api";
import { useExpressGroup } from "@/store/expressGroup";
import { groupFixture } from "@/test/expressGroup";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listMyExpressGroups: jest.fn(),
    createExpressGroup: jest.fn(),
    getExpressGroup: jest.fn(),
    getExpressGroupInvite: jest.fn(),
    joinExpressGroup: jest.fn(),
    removeExpressGroupMember: jest.fn(),
    setExpressGroupPaidBack: jest.fn(),
    decideExpressGroupShop: jest.fn(),
    getExpressGroupTracking: jest.fn(),
    leaveExpressGroup: jest.fn(),
  };
});

const refusal = (status: number, error: string) => new api.ApiError(status, { error });

beforeEach(() => {
  jest.clearAllMocks();
  useExpressGroup.getState().reset();
});

describe("whether GRIDGO offers groups", () => {
  it("turns groups off on an API from before them", async () => {
    jest.mocked(api.listMyExpressGroups).mockRejectedValue(refusal(404, "not_found"));
    await useExpressGroup.getState().loadMine();
    expect(useExpressGroup.getState().available).toBe("off");
  });

  it("keeps the answer unknown when the read merely fails", async () => {
    jest.mocked(api.listMyExpressGroups).mockRejectedValue(refusal(503, "unavailable"));
    await useExpressGroup.getState().loadMine();
    expect(useExpressGroup.getState().available).toBe("unknown");
  });

  it("turns groups on and drops invite tokens of groups no longer open", async () => {
    useExpressGroup.setState({ tokens: { grp_open: "tok_a", grp_done: "tok_b" } });
    jest.mocked(api.listMyExpressGroups).mockResolvedValue([
      groupFixture({ id: "grp_open", state: "open" }),
      groupFixture({ id: "grp_done", state: "ordered" }),
    ]);
    await useExpressGroup.getState().loadMine();
    expect(useExpressGroup.getState().available).toBe("on");
    expect(useExpressGroup.getState().tokens).toEqual({ grp_open: "tok_a" });
  });
});

describe("hosting", () => {
  it("keeps the invite token GRIDGO returns once, to share again later", async () => {
    jest.mocked(api.createExpressGroup).mockResolvedValue({ group: groupFixture({ id: "grp_new" }), inviteToken: "tok_once" });
    const group = await useExpressGroup.getState().create({ fulfillmentMode: "delivery" } as api.ExpressGroupSetup);
    expect(group?.id).toBe("grp_new");
    expect(useExpressGroup.getState().tokens.grp_new).toBe("tok_once");
    expect(useExpressGroup.getState().busy).toBeNull();
  });

  it("persists only the tokens", () => {
    const options = (useExpressGroup as unknown as { persist: { getOptions: () => { partialize: (s: unknown) => unknown } } }).persist.getOptions();
    useExpressGroup.setState({ tokens: { g: "t" }, byId: { g: groupFixture() } });
    expect(options.partialize(useExpressGroup.getState())).toEqual({ tokens: { g: "t" } });
  });

  it("removes a member and marks one paid back from GRIDGO's answer", async () => {
    const after = groupFixture({ people: 2 });
    jest.mocked(api.removeExpressGroupMember).mockResolvedValue(after);
    expect(await useExpressGroup.getState().remove("grp_1", "u_b")).toBe(true);
    expect(api.removeExpressGroupMember).toHaveBeenCalledWith("grp_1", "u_b");
    expect(useExpressGroup.getState().byId.grp_1.people).toBe(2);
  });

  it("says a refusal in plain words", async () => {
    jest.mocked(api.setExpressGroupPaidBack).mockRejectedValue(refusal(403, "group_host_required"));
    expect(await useExpressGroup.getState().setPaidBack("grp_1", "u_b", true)).toBe(false);
    expect(useExpressGroup.getState().error).toBe("Only the host can do that.");
  });

  it("records the use-or-cancel choice and reads tracking again", async () => {
    jest.mocked(api.decideExpressGroupShop).mockResolvedValue(groupFixture({ state: "ordered" }));
    jest.mocked(api.getExpressGroupTracking).mockResolvedValue({ orderId: "ord_1" } as api.ExpressGroupTracking);
    expect(await useExpressGroup.getState().decide("grp_1", "use")).toBe(true);
    expect(api.decideExpressGroupShop).toHaveBeenCalledWith("grp_1", "use");
    expect(api.getExpressGroupTracking).toHaveBeenCalledWith("grp_1");
  });
});

describe("members", () => {
  it("reads an invite as already joined when the group is one of theirs", async () => {
    useExpressGroup.setState({ mine: [groupFixture({ id: "grp_1" })] });
    jest.mocked(api.getExpressGroupInvite).mockResolvedValue({ id: "grp_1" } as api.ExpressGroupInvite);
    await useExpressGroup.getState().readInvite("tok");
    expect(useExpressGroup.getState().invite).toEqual({ status: "member", token: "tok", groupId: "grp_1" });
  });

  it("reads a full or closed invite calmly", async () => {
    jest.mocked(api.getExpressGroupInvite).mockRejectedValue(refusal(409, "group_full"));
    useExpressGroup.setState({ mine: [] });
    await useExpressGroup.getState().readInvite("tok");
    expect(useExpressGroup.getState().invite).toEqual({ status: "closed", token: "tok", message: "This group is full." });
  });

  it("knows a removed member is no longer in the group", async () => {
    useExpressGroup.setState({ byId: { grp_1: groupFixture() } });
    jest.mocked(api.getExpressGroup).mockRejectedValue(refusal(403, "group_membership_required"));
    expect(await useExpressGroup.getState().load("grp_1")).toBeNull();
    expect(useExpressGroup.getState().byId.grp_1).toBeUndefined();
    expect(useExpressGroup.getState().gone.grp_1).toBe("You are no longer in this group. Your files were not ordered.");
    expect(useExpressGroup.getState().loadError.grp_1).toBeUndefined();
  });

  it("leaves and forgets the group", async () => {
    useExpressGroup.setState({ byId: { grp_1: groupFixture() }, mine: [groupFixture()] });
    jest.mocked(api.leaveExpressGroup).mockResolvedValue(undefined as never);
    expect(await useExpressGroup.getState().leave("grp_1")).toBe(true);
    expect(useExpressGroup.getState().mine).toEqual([]);
  });
});
