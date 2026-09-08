import { type Href } from "expo-router";

import { AuthLandingRedirect, useAuthLanding } from "@/components/AuthLandingRedirect";
import { useSession } from "@/store/session";

const welcome = "/(auth)/welcome" as Href;
const login = "/(auth)/login" as Href;

/**
 * Launch mapping only. The ladder itself lives in `lib/authLanding.ts`, and
 * this screen is also where the root guard lands anyone whose auth screen was
 * removed the moment their session appeared.
 */
export default function Index() {
  const landing = useAuthLanding();
  const error = useSession((state) => state.error);
  return (
    <AuthLandingRedirect landing={landing} whenSignedOut={error ? login : welcome} />
  );
}
