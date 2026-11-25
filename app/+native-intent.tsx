import { joinTokenInPath } from "@/lib/memberships";
import { inviteTokenInPath, usePendingGroupInvite } from "@/store/pendingGroupInvite";
import { usePendingJoin } from "@/store/pendingJoin";
import { useSession } from "@/store/session";

/**
 * Every link the system opens the app with passes through here first
 * (Expo Router `redirectSystemPath`). A group invite or a member link is held
 * so a person who still has to sign in lands on it afterwards; the path itself
 * is left unchanged.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const token = inviteTokenInPath(path);
    // Signed in, the link opens the join screen directly.
    if (token && !useSession.getState().user) usePendingGroupInvite.getState().hold(token);
    const join = joinTokenInPath(path);
    if (join && !useSession.getState().user) usePendingJoin.getState().hold(join);
  } catch {
    // A link is never refused because it could not be remembered.
  }
  return path;
}
