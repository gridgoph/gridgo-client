import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppUpdateSheet } from "@/components/AppUpdateSheet";
import { APP_UPDATE_SOURCE } from "@/lib/appUpdate";
import { useAppUpdate } from "@/store/appUpdate";

const installed = { versionCode: 95, versionName: "1.0.95" };
const latest = { versionCode: 96, versionName: "1.0.96" };

function renderSheet(ready = true) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <AppUpdateSheet ready={ready} />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  useAppUpdate.getState().reset();
});

// One press per file, and it goes last: see "Running and testing" in AGENTS.md.
describe("AppUpdateSheet", () => {
  it("draws nothing until there is something to say", async () => {
    useAppUpdate.setState({ installed });
    await renderSheet();
    expect(screen.queryByText("A new version of GRIDGO is ready")).toBeNull();
    expect(screen.queryByText("Update completed")).toBeNull();
  });

  it("waits for the launch intro before offering", async () => {
    useAppUpdate.setState({ installed, available: latest });
    await renderSheet(false);
    expect(screen.queryByText("A new version of GRIDGO is ready")).toBeNull();
  });

  it("confirms an update before offering the next one", async () => {
    useAppUpdate.setState({ installed: latest, completed: latest, available: latest });
    await renderSheet();
    expect(screen.getByText("Update completed")).toBeTruthy();
    expect(screen.getByText("You're on 1.0.96.")).toBeTruthy();
    expect(screen.queryByText("A new version of GRIDGO is ready")).toBeNull();
  });

  it("names both versions and hands the download to the phone", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    useAppUpdate.setState({ installed, available: latest });
    await renderSheet();

    expect(screen.getByText("A new version of GRIDGO is ready")).toBeTruthy();
    expect(
      screen.getByLabelText("On this phone: 1.0.95. Ready to install: 1.0.96."),
    ).toBeTruthy();

    fireEvent.press(screen.getByText("Update now"));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith(APP_UPDATE_SOURCE.downloadUrl));
    await waitFor(() => expect(useAppUpdate.getState().available).toBeNull());
    // Updating is not putting it off.
    expect(useAppUpdate.getState().dismissed).toBeNull();
  });
});
