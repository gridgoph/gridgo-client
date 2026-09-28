import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhatsNewScreen from "@/app/whats-new";
import { useAppUpdate } from "@/store/appUpdate";
import { useWhatsNewHistory } from "@/store/whatsNewHistory";

// A fixture history, never the repository's WHATS_NEW.md: CI rewrites that on
// every release, and a test reading it would break the release that did.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: "1.0.171",
      extra: {
        whatsNewHistory: [
          { version: "1.0.166", kind: "fix", notes: ["Saving reliably"] },
          { version: "1.0.171", kind: "improvement", notes: ["Chat stays in view"] },
          { version: "1.0.158", kind: "feature", notes: ["Ask for a refund"] },
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

it("lists every release newest first, labelled, with a newer one read online", async () => {
  (global.fetch as jest.Mock).mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => [
      {
        tag_name: "v1.0.180",
        body: "## What's new\n\nRelease type: New feature\n\n- Track your rider\n\n## Build\n",
      },
      { tag_name: "v1.0.171", body: "## What's new\n\n- Online copy of 171\n" },
    ],
  }));

  await renderInSafeArea(<WhatsNewScreen />);

  expect(await screen.findByText("1.0.180")).toBeTruthy();
  const order = screen.getAllByTestId(/^release:/).map((row) => row.props.testID);
  expect(order).toEqual(["release:1.0.180", "release:1.0.171", "release:1.0.166", "release:1.0.158"]);

  expect(screen.getByLabelText("Version 1.0.180, New feature, Not installed yet. Track your rider")).toBeTruthy();
  expect(screen.getByLabelText("Version 1.0.171, Improvement, On this phone. Chat stays in view")).toBeTruthy();
  expect(screen.getByLabelText("Version 1.0.166, Fix. Saving reliably")).toBeTruthy();
  expect(screen.queryByText("Online copy of 171")).toBeNull();
  expect(screen.getByText("This phone has version 1.0.171. Every release is here, newest first.")).toBeTruthy();
  expect(screen.queryByText(/You're offline/)).toBeNull();
});
