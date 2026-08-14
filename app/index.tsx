import { Redirect, type Href } from "expo-router";
import { needsClientProfile } from "@/lib/signup";
import { useSession } from "@/store/session";

const completeProfile = "/complete-profile" as Href;

export default function Index() {
  const { user, pendingClerkProfile, justProvisioned } = useSession();
  if (user && needsClientProfile(user)) return <Redirect href={completeProfile} />;
  if (!user && pendingClerkProfile) return <Redirect href={completeProfile} />;
  if (user && justProvisioned) {
    return <Redirect href={{ pathname: "/onboarding", params: { returnTo: "home" } }} />;
  }
  if (user) return <Redirect href="/(tabs)/home" />;
  return <Redirect href={"/(auth)/welcome" as Href} />;
}
