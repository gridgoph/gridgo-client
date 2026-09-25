import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

import { AppUpdateNotices } from "@/components/AppUpdateNotices";
import { APP_UPDATE_SOURCE } from "@/lib/appUpdate";
import { useAppUpdate } from "@/store/appUpdate";

const installed = { versionCode: 95, versionName: "1.0.95" };
const latest = { versionCode: 96, versionName: "1.0.96" };

beforeEach(() => {
  useAppUpdate.getState().reset();
});

// One press per test, and the async one goes last: see "Running and testing" in AGENTS.md.
describe("AppUpdateNotices", () => {
  it("draws nothing while this phone is current", async () => {
    useAppUpdate.setState({ installed: latest, latest });
    await render(<AppUpdateNotices />);
    expect(screen.queryByText(/App update available/)).toBeNull();
    expect(screen.queryByText(/Updated to version/)).toBeNull();
  });

  it("draws nothing where the check does not run (Expo Go, dev)", async () => {
    useAppUpdate.setState({ installed: null, latest });
    await render(<AppUpdateNotices />);
    expect(screen.queryByText(/App update available/)).toBeNull();
  });

  it("keeps the update card after Later put the sheet away", async () => {
    useAppUpdate.setState({
      installed,
      latest,
      promptOpen: false,
      dismissed: { versionCode: 96, at: Date.now() },
    });
    await render(<AppUpdateNotices />);
    expect(screen.getByText("App update available: version 1.0.96")).toBeTruthy();
    expect(screen.getByText(/This phone has 1\.0\.95\./)).toBeTruthy();
    expect(screen.getByText("Update now")).toBeTruthy();
  });

  it("says once that the phone was updated", async () => {
    useAppUpdate.setState({ installed, updatedNotice: { build: installed, at: Date.now() } });
    await render(<AppUpdateNotices />);
    expect(screen.getByText("Updated to version 1.0.95")).toBeTruthy();
    expect(screen.getByText("Just now")).toBeTruthy();
  });

  it("does not say the phone updated to a build it no longer runs", async () => {
    useAppUpdate.setState({ installed, updatedNotice: { build: latest, at: Date.now() } });
    await render(<AppUpdateNotices />);
    expect(screen.queryByText(/Updated to version/)).toBeNull();
  });

  it("lets the Updated item be dismissed", async () => {
    useAppUpdate.setState({ installed, updatedNotice: { build: installed, at: Date.now() } });
    await render(<AppUpdateNotices />);
    fireEvent.press(screen.getByLabelText("Dismiss: Updated to version 1.0.95"));
    await waitFor(() => expect(useAppUpdate.getState().updatedNotice).toBeNull());
  });

  it("takes the same download as the sheet", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    useAppUpdate.setState({ installed, latest, promptOpen: true });
    await render(<AppUpdateNotices />);
    fireEvent.press(screen.getByText("Update now"));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith(APP_UPDATE_SOURCE.downloadUrl));
    await waitFor(() => expect(useAppUpdate.getState().promptOpen).toBe(false));
  });
});
