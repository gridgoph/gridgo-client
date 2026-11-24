import { useSession } from "@/store/session";
import { inviteTokenInPath, usePendingGroupInvite } from "@/store/pendingGroupInvite";

/**
 * Every link the system opens the app with passes through here first
 * (Expo Router `redirectSystemPath`). A group invite is held so a person who
 * still has to sign in lands on the invite afterwards; the path itself is
 * left unchanged.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const token = inviteTokenInPath(path);
    // Signed in, the link opens the join screen directly.
    if (token && !useSession.getState().user) usePendingGroupInvite.getState().hold(token);
  } catch {
    // A link is never refused because it could not be remembered.
  }
  return path;
}
