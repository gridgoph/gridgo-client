import { ApiError } from "@/lib/api";
import * as members from "@/lib/organizationMembersApi";
import { readyRows, useMemberListDraft } from "@/store/memberListDraft";
import { useSession } from "@/store/session";
import { ORG_USER } from "@/test/organizationMembers";

jest.mock("@/lib/organizationMembersApi");

const api = jest.mocked(members);
const store = () => useMemberListDraft.getState();
const ROWS = [
  { name: "Alex Sample", contact: "alex@example.com", memberSince: "2024-08" },
  { name: "Bea Example", contact: "nope", memberSince: "2025-01" },
  { name: "Chris Placeholder", contact: "09170000000", memberSince: "2025-06" },
];
const CHECK: members.MemberListCheck = {
  rowCount: 3,
  readyCount: 2,
  alreadyListedCount: 0,
  needsFixCount: 1,
  needsFix: [{ row: 2, field: "contact", code: "invalid_member_contact", message: "Bad contact" }],
  emailCount: 1,
  mobileCount: 1,
};
const ONE: members.MemberListCheck = { ...CHECK, rowCount: 1, readyCount: 1, needsFixCount: 0, needsFix: [], mobileCount: 0 };

beforeEach(() => {
  Object.values(api).forEach((fn) => jest.isMockFunction(fn) && fn.mockReset());
  useSession.setState({ user: ORG_USER, source: "clerk", loading: false, error: null, signingOut: false });
  store().reset();
  api.getMemberListEntries.mockResolvedValue({
    entries: [],
    nextCursor: null,
    counts: { waiting: 0, accepted: 0, dismissed: 0, expired: 0, removed: 0 },
  });
});

async function checked() {
  store().choose("members.csv", ROWS);
  store().setConsent(true);
  api.checkMemberList.mockResolvedValueOnce(CHECK);
  await store().check();
}

it("puts GRIDGO's answer on the row it was about", async () => {
  await checked();
  expect(store().step).toBe("checked");
  expect(store().fixes).toEqual([{ key: store().rows[1]!.key, message: "No working email or mobile" }]);
  expect(readyRows(store()).map((row) => row.name)).toEqual(["Alex Sample", "Chris Placeholder"]);
});

it("checks a fixed row on its own, and never the whole list again", async () => {
  await checked();
  api.checkMemberList.mockResolvedValueOnce(ONE);
  expect(await store().fix(store().rows[1]!.key, { ...ROWS[1]!, contact: "bea@example.com" })).toBe(true);
  expect(api.checkMemberList).toHaveBeenLastCalledWith([{ ...ROWS[1]!, contact: "bea@example.com" }]);
  expect(store().fixes).toEqual([]);
  expect(store().totals).toMatchObject({ readyCount: 3, emailCount: 2, mobileCount: 1 });
});

it("refuses a fix that repeats somebody already on the list, without asking GRIDGO", async () => {
  await checked();
  expect(await store().fix(store().rows[1]!.key, { ...ROWS[1]!, contact: "ALEX@example.com" })).toBe(false);
  expect(api.checkMemberList).toHaveBeenCalledTimes(1);
  expect(store().fixError).toMatch(/same contact/);
});

it("saves only the rows that passed, and keeps the rest to fix", async () => {
  await checked();
  api.saveMemberList.mockResolvedValue({ ...CHECK, needsFix: [], needsFixCount: 0, savedCount: 2, expiresAt: null });
  expect(await store().save()).toBe(true);
  expect(api.saveMemberList).toHaveBeenCalledWith([ROWS[0], ROWS[2]]);
  expect(store()).toMatchObject({ step: "saved", savedCount: 2 });
  expect(store().rows.map((row) => row.name)).toEqual(["Bea Example"]);
});

it("sends nothing without the consent tick", async () => {
  await checked();
  store().setConsent(false);
  expect(await store().save()).toBe(false);
  expect(api.saveMemberList).not.toHaveBeenCalled();
});

it("asks for consent again when the people change, and keeps the ones typed in", () => {
  store().add(ROWS[0]!);
  store().setConsent(true);
  store().choose("other.csv", [ROWS[2]!]);
  expect(store().consent).toBe(false);
  expect(store().rows.map((row) => row.name)).toEqual(["Alex Sample", "Chris Placeholder"]);
});

it("keeps the list when GRIDGO cannot be reached, and says nobody is added twice", async () => {
  await checked();
  api.saveMemberList.mockRejectedValue(new ApiError(500, null));
  expect(await store().save()).toBe(false);
  expect(store().rows).toHaveLength(3);
  expect(store().error).toBeTruthy();
});

it("says the day's limit plainly", async () => {
  store().choose("members.csv", ROWS);
  api.checkMemberList.mockRejectedValue(new ApiError(429, { error: "member_list_daily_limit" }));
  await store().check();
  expect(store().error).toBe("You have reached today's limit for member lists. Try again tomorrow.");
});

it("forgets other people's contacts on sign out", async () => {
  await checked();
  useSession.setState({ user: null });
  expect(store().rows).toEqual([]);
});
