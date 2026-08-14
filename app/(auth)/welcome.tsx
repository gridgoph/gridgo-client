import { Image } from "expo-image";
import { Redirect, type Href, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { needsClientProfile } from "@/lib/signup";
import { useSession } from "@/store/session";

export default function WelcomeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const user = useSession((state) => state.user);
  const pendingClerkProfile = useSession((state) => state.pendingClerkProfile);
  const justProvisioned = useSession((state) => state.justProvisioned);

  if (user && needsClientProfile(user)) return <Redirect href={"/complete-profile" as Href} />;
  if (!user && pendingClerkProfile) return <Redirect href={"/complete-profile" as Href} />;
  if (user && justProvisioned) {
    return <Redirect href={{ pathname: "/onboarding", params: { returnTo: "home" } }} />;
  }
  if (user) return <Redirect href="/(tabs)/home" />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="gg-page min-h-full justify-between gap-8 py-6">
          <GridgoLogo size={30} />

          <View className="flex-1 items-center justify-center">
            <Image
              source={require("@/assets/illustrations/greeting.svg")}
              contentFit="contain"
              style={{ width: "100%", maxWidth: 480, aspectRatio: 943 / 796, alignSelf: "center" }}
              accessibilityLabel="A person at a desk waving hello from a bright GRIDGO welcome scene"
            />
          </View>

          <View className="gap-6 pb-2">
            <View className="items-center gap-3">
              <Text
                className="max-w-80 text-center text-display font-black text-text-primary"
                accessibilityRole="header"
              >
                Print anything.{"\n"}We’ll handle the rest.
              </Text>
              <Text className="max-w-80 text-center text-body-lg text-text-secondary">
                Request, approve, pay, and follow every print job from one place.
              </Text>
            </View>

            <View className="gap-3">
              <PrimaryButton label="Sign Up" onPress={() => router.push("/(auth)/signup")} />
              <SecondaryButton
                label="Already have an account"
                onPress={() => router.push("/(auth)/login")}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
