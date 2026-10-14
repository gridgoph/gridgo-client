import { fireEvent, render, screen } from "@testing-library/react-native";

import { PushEnableCard } from "@/components/PushEnableCard";
import { usePush } from "@/store/push";
import { useSession } from "@/store/session";

/**
 * A granted phone whose GRIDGO channel was set to Silent (gridgo-client#231).
 * Android hands a channel to the person once it exists, so only its settings
 * page can give it a sound back. One press per file (AGENTS.md).
 */
it("says the notifications are silent and opens the channel's settings", async () => {
  const openChannelSettings = jest.fn(async () => {});
  useSession.setState({
    user: { id: "u1", email: "client@gridgo.local", name: "Client", role: "client" },
  });
  usePush.setState({
    supported: true,
    permission: "granted",
    channelSilent: true,
    busy: false,
    error: null,
    openChannelSettings,
  });
  await render(<PushEnableCard />);

  expect(screen.getByText("GRIDGO notifications are silent")).toBeTruthy();
  await fireEvent.press(screen.getByText("Open notification settings"));
  expect(openChannelSettings).toHaveBeenCalledTimes(1);
});
