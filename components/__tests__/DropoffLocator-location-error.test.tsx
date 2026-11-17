import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import { AccessibilityInfo, Platform } from "react-native";

import { DropoffLocator } from "@/components/DropoffLocator";
import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import * as location from "@/lib/deviceLocation";

jest.mock("@/components/PinPicker", () => ({ PinPicker: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("@/components/PinPicker.native", () => ({ PinPicker: ({ children }: { children: React.ReactNode }) => children }));

let editor: ReturnType<typeof useDropoffEditor>;
function capture(current: ReturnType<typeof useDropoffEditor>) { editor = current; }
function Harness() {
  const current = useDropoffEditor({ skipPrePin: true });
  useEffect(() => capture(current));
  return <DropoffLocator editor={current} />;
}

afterEach(() => jest.restoreAllMocks());

it("announces a location failure and keeps Try again operable", async () => {
  const request = jest.spyOn(location, "requestCurrentLocation")
    .mockResolvedValueOnce({ status: "unavailable", message: location.LOCATION_UNAVAILABLE })
    .mockResolvedValueOnce({ status: "denied", message: location.LOCATION_DENIED });
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  await render(<Harness />);
  await act(async () => editor.useMyLocation());
  const alert = screen.getByRole("alert");
  expect(alert).toHaveProp("accessibilityLiveRegion", "assertive");
  expect(alert).toHaveProp("aria-live", "assertive");
  expect(screen.getByText(location.LOCATION_UNAVAILABLE)).toBeTruthy();
  if (Platform.OS === "ios") expect(announce).toHaveBeenCalledWith(location.LOCATION_UNAVAILABLE);
  expect(screen.getByRole("button", { name: "Use my location" })).toHaveProp("accessibilityState", { disabled: false, busy: false });
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(request).toHaveBeenCalledTimes(2);
  expect(await screen.findByRole("alert")).toHaveTextContent(location.LOCATION_DENIED);
  if (Platform.OS === "ios") expect(announce).toHaveBeenLastCalledWith(location.LOCATION_DENIED);
});
