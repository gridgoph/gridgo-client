import { ApiError } from "@/lib/api";
import * as memberApi from "@/lib/membershipsApi";
import { MATCH_GAP_MS, useMemberships } from "@/store/memberships";
import { useSession } from "@/store/session";
import { JOIN_TOKEN, membership, membershipInvite, membershipMatch } from "@/test/membershipFixtures";

jest.mock("@/lib/membershipsApi");
const api = jest.mocked(memberApi);
const list = (over: Partial<memberApi.MembershipList> = {}) => ({ serverTime: "2026-11-26T02:00:00.000Z", memberships: [], matches: [], ...over });
const signIn = (id: string, accountType = "individual") =>
  useSession.setState({ user: { id, accountType, role: "client" } as never });

beforeEach(() => {
  for (const call of Object.values(api)) if (jest.isMockFunction(call)) call.mockReset();
  jest.useRealTimers();
  useSession.setState({ user: null });
  signIn("u1");
  useMemberships.getState().reset();
});

it("matches once after sign-in and not again within the gap", async () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  api.matchMemberships.mockResolvedValue(list({ matches: [membershipMatch()] }));
  await useMemberships.getState().match();
  await useMemberships.getState().match();
  expect(api.matchMemberships).toHaveBeenCalledTimes(1);
  expect(useMemberships.getState().matches).toHaveLength(1);
  now.mockReturnValue(1_000_000 + MATCH_GAP_MS);
  await useMemberships.getState().match();
  expect(api.matchMemberships).toHaveBeenCalledTimes(2);
  now.mockRestore();
});

it("still reads the orgs when matching fails", async () => {
  api.matchMemberships.mockRejectedValue(new ApiError(502, { error: "clerk_unavailable" }));
  api.listMemberships.mockResolvedValue(list({ memberships: [membership()] }));
  await useMemberships.getState().match();
  expect(useMemberships.getState()).toMatchObject({ memberships: [membership()], error: null, unavailable: false });
});

it("a plain read waits for the match in flight instead of answering from before it", async () => {
  let finish: (value: memberApi.MembershipList) => void = () => undefined;
  api.matchMemberships.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  const matching = useMemberships.getState().match();
  const reading = useMemberships.getState().load();
  finish(list({ matches: [membershipMatch()] }));
  await Promise.all([matching, reading]);
  expect(api.listMemberships).not.toHaveBeenCalled();
  expect(useMemberships.getState().matches).toHaveLength(1);
});

it("an older GRIDGO offers nothing and fails nothing", async () => {
  api.matchMemberships.mockRejectedValue(new ApiError(404, { error: "not_found" }));
  await useMemberships.getState().match();
  expect(useMemberships.getState()).toMatchObject({ unavailable: true, error: null });
  expect(api.listMemberships).not.toHaveBeenCalled();
});

it("never asks for an organization account", async () => {
  signIn("org1", "organization");
  await useMemberships.getState().match();
  await useMemberships.getState().load();
  expect(api.matchMemberships).not.toHaveBeenCalled();
  expect(api.listMemberships).not.toHaveBeenCalled();
});

it("confirms a match: it leaves the list, joins My orgs and is said once", async () => {
  api.matchMemberships.mockResolvedValue(list({ matches: [membershipMatch()] }));
  api.confirmMembershipMatch.mockResolvedValue(membership());
  await useMemberships.getState().match();
  await useMemberships.getState().confirm("mle_1");
  expect(useMemberships.getState()).toMatchObject({ matches: [], memberships: [membership()], confirmed: membership(), busyId: null });
});

it("keeps a refused match on screen with its reason", async () => {
  api.matchMemberships.mockResolvedValue(list({ matches: [membershipMatch()] }));
  api.confirmMembershipMatch.mockRejectedValue(new ApiError(404, { error: "member_match_not_found" }));
  await useMemberships.getState().match();
  expect(await useMemberships.getState().confirm("mle_1")).toBeNull();
  const state = useMemberships.getState();
  expect(state.matches).toHaveLength(1);
  expect(state.actionError).toEqual({ id: "mle_1", message: expect.stringMatching(/has closed/) });
});

it("takes GRIDGO's answer after Not me", async () => {
  api.matchMemberships.mockResolvedValue(list({ matches: [membershipMatch()] }));
  api.dismissMembershipMatch.mockResolvedValue(list());
  await useMemberships.getState().match();
  expect(await useMemberships.getState().dismiss("mle_1")).toBe(true);
  expect(useMemberships.getState().matches).toEqual([]);
});

it("joins, then cancels, from GRIDGO's own rows", async () => {
  const pending = membership({ status: "pending", memberSince: null });
  api.listMemberships.mockResolvedValue(list());
  api.requestMembership.mockResolvedValue(pending);
  api.endMembership.mockResolvedValue(membership({ status: "removed", removedReason: "request_cancelled" }));
  await useMemberships.getState().load();
  await useMemberships.getState().join(JOIN_TOKEN, "link");
  expect(api.requestMembership).toHaveBeenCalledWith(JOIN_TOKEN, "link");
  expect(useMemberships.getState().memberships).toEqual([pending]);
  expect(await useMemberships.getState().end("mem_1")).toBe(true);
  expect(useMemberships.getState().memberships![0]).toMatchObject({ status: "removed", removedReason: "request_cancelled" });
});

it("tells a link that is over from one that could not be read", async () => {
  api.previewMembershipInvite.mockResolvedValueOnce(membershipInvite());
  await useMemberships.getState().readInvite(JOIN_TOKEN);
  expect(useMemberships.getState().invite).toMatchObject({ status: "ready", token: JOIN_TOKEN });
  api.previewMembershipInvite.mockRejectedValueOnce(new ApiError(404, { error: "member_invite_not_found" }));
  await useMemberships.getState().readInvite(JOIN_TOKEN);
  expect(useMemberships.getState().invite).toMatchObject({ status: "closed" });
  api.previewMembershipInvite.mockRejectedValueOnce(new ApiError(500, { error: "server_error" }));
  await useMemberships.getState().readInvite(JOIN_TOKEN);
  expect(useMemberships.getState().invite).toMatchObject({ status: "failed" });
});

it("drops one person's orgs when another signs in, and an answer still on its way", async () => {
  let finish: (value: memberApi.MembershipList) => void = () => undefined;
  api.listMemberships.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  const reading = useMemberships.getState().load();
  signIn("u2");
  finish(list({ memberships: [membership()] }));
  await reading;
  expect(useMemberships.getState().memberships).toBeNull();
});
