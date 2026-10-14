import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabScreen } from "@/components/TabScreen";
import { tabScreenContentPadding } from "@/components/GridgoTabBar";
import { NotificationInbox } from "@/components/NotificationInbox";
import { ScreenHeader } from "@/components/ScreenHeader";

/** The Notifications tab: the inbox under the tab header. */
export default function NotificationsScreen() {
  const tabPad = tabScreenContentPadding(useSafeAreaInsets().bottom);

  return (
    <TabScreen>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-4 pt-4" style={{ paddingBottom: tabPad }}>
          <ScreenHeader title="Notifications" />
          <NotificationInbox />
        </View>
      </ScrollView>
    </TabScreen>
  );
}
