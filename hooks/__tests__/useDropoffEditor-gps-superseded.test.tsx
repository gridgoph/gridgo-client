import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import * as deviceLocation from "@/lib/deviceLocation";
import type { DeviceLocationResult } from "@/lib/deviceLocation";
import * as geocode from "@/lib/geocode";

const TAPPED = { lat: 7.0731, lng: 125.6128 };
const GPS = { lat: 7.0844, lng: 125.6147 };

function Harness() {
  const editor = useDropoffEditor({ skipPrePin: true });
  return (
    <>
      <Text accessibilityLabel="locating">{editor.locating ? "yes" : "no"}</Text>
      <Text accessibilityLabel="pin title">{editor.pin.title}</Text>
      <Text accessibilityLabel="pin">{editor.point ? `${editor.point.lat},${editor.point.lng}` : ""}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Locate" onPress={() => void editor.useMyLocation()} />
      <Pressable accessibilityRole="button" accessibilityLabel="Drop pin" onPress={() => editor.pickPin(TAPPED)} />
    </>
  );
}

// Regression for gridgo-client#432 review C1: a pin placed while Use my
// location was still acquiring left "Finding you…" and the button stuck.
// Two presses, so this file holds this one test.
it("a pin placed while the phone is still locating takes over, and the late fix is ignored", async () => {
  let resolveGps: (value: DeviceLocationResult) => void = () => undefined;
  jest.spyOn(deviceLocation, "requestCurrentLocation").mockImplementation(
    () => new Promise((resolve) => (resolveGps = resolve)),
  );
  jest.spyOn(geocode, "reverseNominatim").mockResolvedValue({
    status: "ok",
    suggestion: { id: "r", label: "Tapped street", line1: "Tapped street", landmark: "", point: TAPPED },
  });

  await render(<Harness />);
  fireEvent.press(screen.getByLabelText("Locate"));
  await waitFor(() => expect(screen.getByLabelText("locating").props.children).toBe("yes"));
  fireEvent.press(screen.getByLabelText("Drop pin"));
  await waitFor(() => expect(screen.getByLabelText("pin title").props.children).toBe("Tapped street"));

  await act(async () => {
    resolveGps({ status: "ok", point: GPS, accuracyMeters: 20 });
  });

  expect(screen.getByLabelText("locating").props.children).toBe("no");
  expect(screen.getByLabelText("pin").props.children).toBe(`${TAPPED.lat},${TAPPED.lng}`);
  expect(screen.getByLabelText("pin title").props.children).toBe("Tapped street");
});
