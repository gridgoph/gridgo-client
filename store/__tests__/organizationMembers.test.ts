import { ApiError } from "@/lib/api";
import * as members from "@/lib/organizationMembersApi";
import { useOrganizationMembers } from "@/store/organizationMembers";
import { useSession } from "@/store/session";
import { EXPIRED, MEMBER, ORG_USER, PARTNERSHIP, REQUEST, SUMMARY, TERM } from "@/test/organizationMembers";

jest.mock("@/lib/organizationMembersApi");

const api = jest.mocked(members);
const store = () => useOrganizationMembers.getState();
const refused = (status: number, error: string) => new ApiError(status, { error });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  Object.values(api).forEach((fn) => jest.isMockFunction(fn) && fn.mockReset());
  useSession.setState({ user: ORG_USER, source: "clerk", loading: false, error: null, signingOut: false });
  store().reset();
  api.getMembersSummary.mockResolvedValue(SUMMARY);
  api.getPartnership.mockResolvedValue(PARTNERSHIP);
  api.listMemberRequests.mockResolvedValue({ requests: [REQUEST], total: 1, nextCursor: null });
  api.listMembers.mockResolvedValue({ term: TERM, members: [MEMBER], total: 1, nextCursor: null });
});

it("opens member screens only on GRIDGO's answer, and closes them when it refuses", async () => {
  expect(store().partner).toBe("unknown");
  await store().loadSummary();
  expect(store().partner).toBe("live");
  api.getMembersSummary.mockRejectedValueOnce(refused(403, "organization_partner_required"));
  await store().loadSummary();
  expect(store()).toMatchObject({ partner: "none", summary: null });
});

it("keeps what was on screen when a refresh fails", async () => {
  await store().loadMembers();
  api.listMembers.mockRejectedValueOnce(new Error("offline"));
  await store().loadMembers();
  expect(store().list.rows).toEqual([MEMBER]);
  expect(store().list.status).toBe("failed");
  expect(store().list.error).toBeTruthy();
});

it("drops everything when somebody else signs in, including an answer still on its way", async () => {
  let land: (value: typeof SUMMARY) => void = () => undefined;
  api.getMembersSummary.mockReturnValueOnce(new Promise((resolve) => (land = resolve)));
  await store().loadMembers();
  const waiting = store().loadSummary();
  useSession.setState({ user: { ...ORG_USER, id: "u_other" } });
  land(SUMMARY);
  await waiting;
  expect(store()).toMatchObject({ summary: null, partner: "unknown" });
  expect(store().list.rows).toEqual([]);
});

it("shows only the newest search when answers cross", async () => {
  let first: (value: members.MemberPage) => void = () => undefined;
  api.listMembers.mockReturnValueOnce(new Promise((resolve) => (first = resolve)));
  store().setQuery("be");
  const slow = store().loadMembers();
  store().setQuery("zz");
  api.listMembers.mockResolvedValueOnce({ term: TERM, members: [], total: 0, nextCursor: null });
  await store().loadMembers();
  first({ term: TERM, members: [MEMBER], total: 1, nextCursor: null });
  await slow;
  expect(store().list.rows).toEqual([]);
  expect(api.listMembers).toHaveBeenLastCalledWith({ q: "zz", filter: "all", status: "active" });
});

it("adds the next page after the first", async () => {
  api.listMembers.mockResolvedValueOnce({ term: TERM, members: [MEMBER], total: 2, nextCursor: "c1" });
  await store().loadMembers();
  api.listMembers.mockResolvedValueOnce({ term: TERM, members: [{ ...MEMBER, id: "m_2" }], total: 2, nextCursor: null });
  await store().moreMembers();
  expect(store().list.rows.map((row) => row.id)).toEqual(["m_1", "m_2"]);
  expect(store().list.nextCursor).toBeNull();
});

it("approves with the date and the term, and the request leaves the list", async () => {
  await store().loadRequests();
  api.approveMember.mockResolvedValue(MEMBER);
  expect(await store().approve(REQUEST, "2025-08", TERM.code)).toBe(true);
  expect(api.approveMember).toHaveBeenCalledWith("m_req_1", 1, "2025-08", TERM.code);
  expect(store().requests.rows).toEqual([]);
  expect(store().notice).toBe("Alex Sample is now a member");
});

it("reads again when a request was answered elsewhere, and says so", async () => {
  await store().loadRequests();
  api.approveMember.mockRejectedValue(refused(409, "membership_not_pending"));
  api.listMemberRequests.mockResolvedValue({ requests: [], total: 0, nextCursor: null });
  expect(await store().approve(REQUEST, "2025-08", TERM.code)).toBe(false);
  await settle();
  expect(store().requests.rows).toEqual([]);
  expect(store().actionError).toBe("This request was already answered or cancelled.");
});

it("edits the date and removes with the version it read", async () => {
  await store().loadMembers();
  api.editMemberSince.mockResolvedValue({ ...MEMBER, memberSince: "2023-06-01", version: 5 });
  expect(await store().editSince(MEMBER, "2023-06")).toBe(true);
  expect(api.editMemberSince).toHaveBeenCalledWith("m_1", 4, "2023-06");
  expect(store().list.rows[0]!.version).toBe(5);
  api.removeMember.mockResolvedValue(undefined);
  api.listMembers.mockResolvedValue({ term: TERM, members: [], total: 0, nextCursor: null });
  expect(await store().remove(store().list.rows[0]!)).toBe(true);
  expect(api.removeMember).toHaveBeenCalledWith("m_1", 5);
  expect(store().list.rows).toEqual([]);
});

it("ticks nobody for the officer, and renews only who was ticked", async () => {
  api.listMembers.mockResolvedValue({ term: TERM, members: [EXPIRED, { ...EXPIRED, id: "m_old2" }], total: 2, nextCursor: null });
  await store().loadExpired();
  expect(store().selected).toEqual([]);
  store().toggleSelected("m_old");
  api.renewMembers.mockResolvedValue({ renewed: ["m_old"], term: TERM });
  expect(await store().renewSelected()).toBe(true);
  expect(api.renewMembers).toHaveBeenCalledWith(["m_old"]);
  expect(store().selected).toEqual([]);
  expect(store().notice).toBe("1 member renewed for SY 2026-27");
});

it("renews nobody when one was already renewed, and reads the list again", async () => {
  api.listMembers.mockResolvedValue({ term: TERM, members: [EXPIRED], total: 1, nextCursor: null });
  await store().loadExpired();
  store().selectAll();
  api.renewMembers.mockRejectedValue(refused(409, "membership_not_expired"));
  api.listMembers.mockResolvedValue({ term: TERM, members: [], total: 0, nextCursor: null });
  expect(await store().renewSelected()).toBe(false);
  await settle();
  expect(store().expired.rows).toEqual([]);
  expect(store().selected).toEqual([]);
  expect(store().actionError).toMatch(/already renewed/);
});

it("sends one action at a time", async () => {
  let land: (value: void) => void = () => undefined;
  api.declineMember.mockReturnValueOnce(new Promise((resolve) => (land = resolve)));
  const first = store().decline(REQUEST);
  expect(await store().decline(REQUEST)).toBe(false);
  land();
  await first;
  expect(api.declineMember).toHaveBeenCalledTimes(1);
});
