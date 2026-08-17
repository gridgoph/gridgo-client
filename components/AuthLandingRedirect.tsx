import { Redirect, type Href } from "expo-router";

import { authLanding, type AuthLanding } from "@/lib/authLanding";
import { useSession } from "@/store/session";

/**
 * The session's landing, as a route.
 *
 * Every auth-adjacent screen renders this first and shows its own content only
 * when it returns null. Keeping the hrefs here means a signed-in client cannot
 * be left sitting on the sign-in form because one screen's ladder was missing a
 * rung. See `lib/authLanding.ts` for the rules themselves.
 */

const COMPLETE_PROFILE = "/complete-profile" as Href;

export function useAuthLanding(): AuthLanding {
  const user = useSession((state) => state.user);
  const pendingClerkProfile = useSession((state) => state.pendingClerkProfile);
  const justProvisioned = useSession((state) => state.justProvisioned);
  return authLanding({ user, pendingClerkProfile, justProvisioned });
}

export function AuthLandingRedirect({
  landing,
  whenSignedOut,
}: {
  landing: AuthLanding;
  /** Where a screen with no form of its own sends a signed-out visitor. */
  whenSignedOut?: Href;
}) {
  if (landing.kind === "complete_profile") return <Redirect href={COMPLETE_PROFILE} />;
  if (landing.kind === "onboarding") {
    return <Redirect href={{ pathname: "/onboarding", params: { returnTo: "home" } }} />;
  }
  if (landing.kind === "home") return <Redirect href="/(tabs)/home" />;
  return whenSignedOut ? <Redirect href={whenSignedOut} /> : null;
}
