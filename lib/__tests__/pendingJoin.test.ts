import { redirectSystemPath } from "@/app/+native-intent";
import { usePendingGroupInvite } from "@/store/pendingGroupInvite";
import { usePendingJoin } from "@/store/pendingJoin";
import { useSession } from "@/store/session";
import { JOIN_TOKEN } from "@/test/membershipFixtures";

beforeEach(() => {
  useSession.setState({ user: null });
  usePendingJoin.setState({ token: null });
  usePendingGroupInvite.setState({ token: null });
});

it("holds a member link for a person who still has to sign in, and only that link", () => {
  const path = `gridgoclient://join/${JOIN_TOKEN}`;
  expect(redirectSystemPath({ path, initial: true })).toBe(path);
  expect(usePendingJoin.getState().token).toBe(JOIN_TOKEN);
  expect(usePendingGroupInvite.getState().token).toBeNull();
});

it("leaves a group print's invite to the group", () => {
  redirectSystemPath({ path: `gridgoclient://express/group/join/${JOIN_TOKEN}`, initial: true });
  expect(usePendingJoin.getState().token).toBeNull();
  expect(usePendingGroupInvite.getState().token).toBe(JOIN_TOKEN);
});

it("holds nothing for someone signed in: the link opens the screen itself", () => {
  useSession.setState({ user: { id: "u1" } as never });
  redirectSystemPath({ path: `/join/${JOIN_TOKEN}`, initial: false });
  expect(usePendingJoin.getState().token).toBeNull();
});
