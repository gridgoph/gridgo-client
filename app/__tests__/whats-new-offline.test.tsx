import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhatsNewScreen from "@/app/whats-new";
import { WHATS_NEW_HISTORY_COPY } from "@/lib/whatsNewHistory";
import { useAppUpdate } from "@/store/appUpdate";
import { useWhatsNewHistory } from "@/store/whatsNewHistory";

// A fixture history, never the repository's WHATS_NEW.md (see whats-new.test.tsx).
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: "1.0.171",
      extra: {
        whatsNewHistory: [
          { version: "1.0.171", kind: "improvement", notes: ["Chat stays in view"] },
          { version: "1.0.166", kind: "fix", notes: ["Saving reliably"] },
        ],
      },
    },
  },
}));

function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

beforeEach(() => {
  useWhatsNewHistory.setState({ status: "idle", online: [], loadedAt: null });
  useAppUpdate.setState({ installed: { versionCode: 171, versionName: "1.0.171" } });
});

it("shows the history this version carries, and says calmly that it is offline", async () => {
  (global.fetch as jest.Mock).mockImplementation(async () => {
    throw new TypeError("Network request failed");
  });

  await renderInSafeArea(<WhatsNewScreen />);

  expect(await screen.findByText(WHATS_NEW_HISTORY_COPY.offline)).toBeTruthy();
  expect(screen.getAllByTestId(/^release:/).map((row) => row.props.testID)).toEqual([
    "release:1.0.171",
    "release:1.0.166",
  ]);
  expect(screen.getByText("Chat stays in view")).toBeTruthy();
  expect(screen.getByText("On this phone")).toBeTruthy();
  expect(useWhatsNewHistory.getState().status).toBe("offline");
});
