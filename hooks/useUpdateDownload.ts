import { useState } from "react";
import { Linking } from "react-native";

import { APP_UPDATE_SOURCE } from "@/lib/appUpdate";
import { useAppUpdate } from "@/store/appUpdate";

/**
 * "Update now", wherever it is drawn: hands the landing site's APK to the
 * phone and puts the prompt away. The update sheet and the Notifications card
 * share it so both take the one download path.
 */
export function useUpdateDownload(): {
  update: () => Promise<void>;
  openFailed: boolean;
  clearFailure: () => void;
} {
  const [openFailed, setOpenFailed] = useState(false);

  const update = async () => {
    try {
      await Linking.openURL(APP_UPDATE_SOURCE.downloadUrl);
      setOpenFailed(false);
      useAppUpdate.getState().startDownload();
    } catch {
      setOpenFailed(true);
    }
  };

  return { update, openFailed, clearFailure: () => setOpenFailed(false) };
}
