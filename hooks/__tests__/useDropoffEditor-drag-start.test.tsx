import { act, render } from "@testing-library/react-native";
import { useEffect } from "react";

import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import * as location from "@/lib/deviceLocation";
import * as geocode from "@/lib/geocode";

const SAVED = { lat: 7.0731, lng: 125.6128 };
const GPS = { lat: 7.0844, lng: 125.6147 };
let editor: ReturnType<typeof useDropoffEditor>;
function capture(current: ReturnType<typeof useDropoffEditor>) { editor = current; }
function Harness() {
  const current = useDropoffEditor({ skipPrePin: true });
  useEffect(() => capture(current));
  return null;
}

afterEach(() => jest.restoreAllMocks());

it("ignores a fix arriving between drag start and drop", async () => {
  let finish!: (result: location.DeviceLocationResult) => void;
  jest.spyOn(location, "requestCurrentLocation").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const reverse = jest.spyOn(geocode, "reverseNominatim").mockResolvedValue({ status: "empty", message: "No street" });
  await render(<Harness />);
  await act(async () => editor.loadSaved({ label: "Home", line1: "Saved street", landmark: "", point: SAVED }));
  let pending!: Promise<void>;
  await act(async () => { pending = editor.useMyLocation(); });
  expect(editor.locating).toBe(true);
  await act(async () => editor.beginPinDrag());
  await act(async () => { finish({ status: "ok", point: GPS, accuracyMeters: 8 }); await pending; });
  expect(editor.locating).toBe(false);
  expect(editor.point).toEqual(SAVED);
  expect(reverse).not.toHaveBeenCalled();
  await act(async () => editor.pickPin({ lat: 7.074, lng: 125.614 }));
  expect(editor.point).toEqual({ lat: 7.074, lng: 125.614 });
});

it("keeps a search selection when the phone answers later", async () => {
  let finish!: (result: location.DeviceLocationResult) => void;
  jest.spyOn(location, "requestCurrentLocation").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(<Harness />);
  let pending!: Promise<void>;
  await act(async () => { pending = editor.useMyLocation(); });
  await act(async () => editor.pickSearch({ id: "s", label: "Saved street", line1: "Saved street", landmark: "", point: SAVED }));
  await act(async () => { finish({ status: "ok", point: GPS }); await pending; });
  expect(editor.point).toEqual(SAVED);
  expect(editor.line1).toBe("Saved street");
  expect(editor.locating).toBe(false);
});
