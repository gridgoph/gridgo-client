import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { DropoffLocator } from "@/components/DropoffLocator";
import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import * as geocode from "@/lib/geocode";
import type { GeocodeResult } from "@/lib/geocode";

const PIN = { lat: 7.0731, lng: 125.6128 };

const OK: GeocodeResult = {
  status: "ok",
  suggestion: {
    id: "rev",
    label: "12 J.P. Laurel Avenue",
    line1: "12 J.P. Laurel Avenue",
    landmark: "",
    completeAddress: "12 J.P. Laurel Avenue, Bajada, Davao City",
    point: PIN,
  },
};

jest.mock("@/components/PinPicker", () => {
  const React = require("react");
  const { Pressable: MockPressable, Text: MockText } = require("react-native");
  return {
    PinPicker: ({
      onPick,
      caption,
    }: {
      onPick: (point: { lat: number; lng: number }) => void;
      caption?: string | null;
    }) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(MockPressable, {
          accessibilityRole: "button",
          accessibilityLabel: "Drop pin",
          onPress: () => onPick({ lat: 7.0731, lng: 125.6128 }),
        }),
        caption
          ? React.createElement(MockText, { accessibilityLabel: "pin caption" }, caption)
          : null,
      ),
  };
});

jest.mock("@/components/PinPicker.native", () => {
  const React = require("react");
  const { Pressable: MockPressable, Text: MockText } = require("react-native");
  return {
    PinPicker: ({
      onPick,
      caption,
    }: {
      onPick: (point: { lat: number; lng: number }) => void;
      caption?: string | null;
    }) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(MockPressable, {
          accessibilityRole: "button",
          accessibilityLabel: "Drop pin",
          onPress: () => onPick({ lat: 7.0731, lng: 125.6128 }),
        }),
        caption
          ? React.createElement(MockText, { accessibilityLabel: "pin caption" }, caption)
          : null,
      ),
  };
});

function Harness() {
  const editor = useDropoffEditor({ skipPrePin: true });
  return (
    <>
      <DropoffLocator editor={editor} />
      <Text accessibilityLabel="Street and building">{editor.line1}</Text>
      <Text accessibilityLabel="search query">{editor.query}</Text>
    </>
  );
}

describe("DropoffLocator", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("always reverse-geocodes a pin tap, even when street already has text", () => {
    const src = readFileSync(join(__dirname, "..", "DropoffLocator.tsx"), "utf8");
    expect(src).toContain("onPick={editor.pickPin}");
    expect(src).not.toMatch(/if\s*\(\s*!editor\.line1/);
  });

  it("reverse-geocodes every pin tap and shows the complete address, not the search box", async () => {
    let resolveReverse: (value: GeocodeResult) => void = () => undefined;
    const pending = new Promise<GeocodeResult>((resolve) => {
      resolveReverse = resolve;
    });
    jest.spyOn(geocode, "reverseNominatim").mockImplementation(() => pending);

    await render(<Harness />);
    fireEvent.press(screen.getByLabelText("Drop pin"));

    expect(await screen.findByText(geocode.READING_PLACE)).toBeTruthy();

    await act(async () => {
      resolveReverse(OK);
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Street and building").props.children).toBe(
        "12 J.P. Laurel Avenue",
      );
    });
    expect(screen.getByLabelText("pin caption").props.children).toBe(
      "12 J.P. Laurel Avenue, Bajada, Davao City",
    );
    expect(screen.getByLabelText("search query").props.children).toBe("");
    expect(screen.getByLabelText("Search location").props.value).toBe("");
  });
});
