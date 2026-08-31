import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { AuthLandingRedirect, useAuthLanding } from "@/components/AuthLandingRedirect";
import { Screen } from "@/components/Screen";
import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { staysOnAuthScreen } from "@/lib/authLanding";

export default function WelcomeScreen() {
  const router = useRouter();
  const landing = useAuthLanding();

  if (!staysOnAuthScreen(landing)) return <AuthLandingRedirect landing={landing} />;

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="gg-page min-h-full justify-between gap-8 py-6">
          <GridgoLogo size={30} />

          <View className="flex-1 items-center justify-center">
            <Image
              source={require("@/assets/illustrations/welcome.png")}
              contentFit="contain"
              style={{ width: "100%", maxWidth: 480, aspectRatio: 1, alignSelf: "center" }}
              accessibilityLabel="A GRIDGO operator checking a printed invoice against the job on screen"
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
    </Screen>
  );
}
