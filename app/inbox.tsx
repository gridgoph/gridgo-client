import { ScrollView, View } from "react-native";

import { NotificationInbox } from "@/components/NotificationInbox";
import { Screen } from "@/components/Screen";

/**
 * The inbox, pushed over whatever screen the header bell was tapped on (#230).
 *
 * The same body as the Notifications tab. It is its own route so back
 * returns the client to the order or basket they were in, which jumping to
 * the tab would have closed.
 */
export default function InboxScreen() {
  return (
    /* Bottom only — the stack header above has already cleared the status bar. */
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-4 pb-12 pt-4">
          <NotificationInbox />
        </View>
      </ScrollView>
    </Screen>
  );
}
