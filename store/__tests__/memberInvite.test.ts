import * as members from "@/lib/organizationMembersApi";
import { useMemberInvite } from "@/store/memberInvite";
import { useSession } from "@/store/session";
import { ORG_USER, TERM } from "@/test/organizationMembers";

jest.mock("@/lib/organizationMembersApi");

const api = jest.mocked(members);
const store = () => useMemberInvite.getState();
const INVITE: members.MemberInvite = {
  term: TERM,
  token: "tok",
  path: "/join/tok",
  createdAt: "2026-11-01T00:00:00Z",
  expiresAt: "2027-05-31T16:00:00Z",
};
const ENTRY: members.MemberListEntry = {
  id: "e1",
  name: "Alex Sample",
  contactKind: "email",
  contact: "alex@example.com",
  memberSince: "2024-08-01",
  expiresAt: "2026-12-26T00:00:00Z",
};
const COUNTS = { waiting: 1, accepted: 0, dismissed: 0, expired: 0, removed: 0 };

beforeEach(() => {
  Object.values(api).forEach((fn) => jest.isMockFunction(fn) && fn.mockReset());
  useSession.setState({ user: ORG_USER, source: "clerk", loading: false, error: null, signingOut: false });
  store().reset();
});

it("makes the term's link only when there is none", async () => {
  api.getMemberInvite.mockResolvedValueOnce(null);
  api.createMemberInvite.mockResolvedValueOnce(INVITE);
  await store().load();
  expect(store().invite).toEqual(INVITE);
  api.getMemberInvite.mockResolvedValueOnce(INVITE);
  await store().load();
  expect(api.createMemberInvite).toHaveBeenCalledTimes(1);
});

it("hands out no link it could not confirm", async () => {
  api.getMemberInvite.mockResolvedValueOnce(INVITE);
  await store().load();
  api.getMemberInvite.mockRejectedValueOnce(new Error("offline"));
  await store().load();
  expect(store()).toMatchObject({ invite: null, status: "failed" });
});

it("keeps the old link on screen when a new one was not made", async () => {
  api.getMemberInvite.mockResolvedValueOnce(INVITE);
  await store().load();
  api.createMemberInvite.mockRejectedValueOnce(new Error("offline"));
  expect(await store().replace()).toBe(false);
  expect(store().invite).toEqual(INVITE);
  expect(store().notice?.tone).toBe("error");
  api.createMemberInvite.mockResolvedValueOnce({ ...INVITE, path: "/join/new" });
  expect(await store().replace()).toBe(true);
  expect(api.createMemberInvite).toHaveBeenLastCalledWith(true);
  expect(store().invite?.path).toBe("/join/new");
});

it("takes a person off the list and reads the counts again", async () => {
  api.getMemberListEntries.mockResolvedValueOnce({ entries: [ENTRY], nextCursor: null, counts: COUNTS });
  await store().loadEntries();
  api.removeMemberListEntry.mockResolvedValueOnce(undefined);
  api.getMemberListEntries.mockResolvedValueOnce({ entries: [], nextCursor: null, counts: { ...COUNTS, waiting: 0 } });
  expect(await store().removeEntry(ENTRY)).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(store().entries).toEqual([]);
  expect(store().entryCounts?.waiting).toBe(0);
});
