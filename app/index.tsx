import { Redirect, type Href } from "expo-router";
import { useSession } from "@/store/session";

export default function Index() {
  const { user } = useSession();
  if (user) return <Redirect href="/(tabs)/home" />;
  return <Redirect href={"/(auth)/welcome" as Href} />;
}
