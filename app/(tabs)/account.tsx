import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { tabScreenContentPadding } from "@/components/GridgoTabBar";
import { SecondaryButton } from "@/components/SecondaryButton";
import { getApiBase } from "@/lib/api";
import { useThemeColors } from "@/hooks/useTheme";
import { accountTypeOption } from "@/lib/signup";
import { useSession } from "@/store/session";

/**
 * Account: identity, organisation, entry to Settings, resolved backend URL, sign out.
 * Theme preference lives on Settings — not duplicated here.
 */
export default function AccountScreen() {
  const { user, logout } = useSession();
  const colors = useThemeColors();
  // The bar floats over the scene. A flat `pb-12` left Sign out underneath it
  // on every phone with a home indicator — the other four tabs already derive
  // this from the bar's own metrics.
  const tabPad = tabScreenContentPadding(useSafeAreaInsets().bottom);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-6 pt-4" style={{ paddingBottom: tabPad }}>
          <Text className="text-h2 text-text-primary">Account</Text>

          <View className="gg-card gap-1">
            <Text className="text-caption text-text-muted">Signed in as</Text>
            <Text className="text-body-lg font-medium text-text-primary">{user?.name}</Text>
            <Text className="text-body text-text-secondary">{user?.email}</Text>
            <Text className="mt-2 text-caption text-text-muted">
              {accountTypeOption(user?.accountType ?? "individual").label} client
            </Text>
          </View>

          <View className="gg-card gap-1">
            <Text className="text-caption text-text-muted">Organisation</Text>
            <Text className="text-body-lg font-medium text-text-primary">
              {user?.orgName || "—"}
            </Text>
          </View>

          {/* Destination row — not a primary action; chevron + full-row target. */}
          <View className="gg-card-flush">
            <Pressable
              onPress={() => router.push("/settings")}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              accessibilityHint="Opens app preferences"
              className="gg-touch min-h-11 flex-row items-center justify-between px-4 py-3"
              style={({ pressed }) =>
                pressed ? { backgroundColor: colors.surfaceVariant } : undefined
              }
            >
              <Text className="text-body-lg font-medium text-text-primary">Settings</Text>
              <ChevronRight
                size={20}
                color={colors.textMuted}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </Pressable>
          </View>

          <View className="gg-card gap-1">
            <Text className="text-caption text-text-muted">Connected server</Text>
            <Text className="text-body text-text-primary" selectable>
              {getApiBase()}
            </Text>
          </View>

          <SecondaryButton label="Sign out" onPress={() => void logout()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
