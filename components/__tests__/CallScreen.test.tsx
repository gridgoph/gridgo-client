import { render, screen } from "@testing-library/react-native";

import { CallScreen } from "@/components/call/CallScreen";
import type { CallSnapshot } from "@/lib/callEngine";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const handlers = {
  micRefused: false,
  canCallAgain: true,
  onAccept: jest.fn(),
  onDecline: jest.fn(),
  onHangUp: jest.fn(),
  onToggleMute: jest.fn(),
  onToggleSpeaker: jest.fn(),
  onMinimize: jest.fn(),
  onClose: jest.fn(),
  onCallAgain: jest.fn(),
  onMessage: jest.fn(),
};

function snapshot(overrides: Partial<CallSnapshot>): CallSnapshot {
  return {
    orderId: "ord_example",
    direction: "outgoing",
    phase: "ringing",
    call: null,
    peerName: "Sam",
    connectedAt: null,
    muted: false,
    speaker: false,
    ending: null,
    ...overrides,
  };
}

it("rings with Accept and Decline, never a phone number", async () => {
  await render(<CallScreen {...handlers} session={snapshot({ direction: "incoming", phase: "incoming" })} />);
  expect(screen.getByText("Sam")).toBeTruthy();
  expect(screen.getByText("Incoming call")).toBeTruthy();
  expect(screen.getByLabelText("Accept the call from Sam")).toBeTruthy();
  expect(screen.getByLabelText("Decline the call from Sam")).toBeTruthy();
  expect(screen.getByText(/phone number stays private/)).toBeTruthy();
});

it("says the microphone is off when Accept was refused it", async () => {
  await render(<CallScreen {...handlers} micRefused session={snapshot({ direction: "incoming", phase: "incoming" })} />);
  expect(screen.getByText("The microphone is off for GRIDGO")).toBeTruthy();
});

it.each([
  ["ringing", "Ringing…", "Cancel the call"],
  ["preparing", "Calling…", "Cancel the call"],
  ["connecting", "Connecting…", "End the call with Sam"],
  ["reconnecting", "Reconnecting…", "End the call with Sam"],
] as const)("words the %s phase", async (phase, label, end) => {
  await render(<CallScreen {...handlers} session={snapshot({ phase, connectedAt: phase === "reconnecting" ? Date.now() : null })} />);
  expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByLabelText(end)).toBeTruthy();
});

it("runs the timer once connected, with mute and speaker as switches", async () => {
  await render(<CallScreen {...handlers} session={snapshot({ phase: "connected", connectedAt: Date.now() - 65_000, muted: true })} />);
  expect(screen.getByText("1:05")).toBeTruthy();
  expect(screen.getByRole("switch", { name: "Mute" }).props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByRole("switch", { name: "Speaker" }).props.accessibilityState).toMatchObject({ checked: false });
});

it("says why it ended and offers to call again", async () => {
  await render(
    <CallScreen {...handlers} session={snapshot({ phase: "ended", ending: { reason: "declined", durationMs: null, problem: null } })} />,
  );
  expect(screen.getByText("Sam declined")).toBeTruthy();
  expect(screen.getByText("Call again")).toBeTruthy();
  expect(screen.getByText("Send a message")).toBeTruthy();
});

it("says the connection was lost", async () => {
  await render(
    <CallScreen {...handlers} session={snapshot({ phase: "ended", ending: { reason: "network_lost", durationMs: 30_000, problem: null } })} />,
  );
  expect(screen.getByText("Connection lost")).toBeTruthy();
});
