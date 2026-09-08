import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import * as geocode from "@/lib/geocode";
import type { DropoffSuggestion, GeocodeResult } from "@/lib/geocode";

const HIT: DropoffSuggestion = {
  id: "42",
  label: "SM City Davao",
  line1: "SM City Davao, Quimpo Boulevard",
  landmark: "",
  completeAddress: "SM City Davao, Quimpo Boulevard, Matina, Davao City",
  point: { lat: 7.0494, lng: 125.588 },
};

const PIN = { lat: 7.0731, lng: 125.6128 };

const OK: GeocodeResult = {
  status: "ok",
  suggestion: {
    id: "rev",
    label: "12 J.P. Laurel Avenue",
    line1: "12 J.P. Laurel Avenue",
    landmark: "Insular Building",
    completeAddress: "12 J.P. Laurel Avenue, Bajada, Davao City",
    point: PIN,
  },
};

function Harness() {
  const editor = useDropoffEditor({ skipPrePin: true });
  return (
    <>
      <Text accessibilityLabel="Street and building">{editor.line1}</Text>
      <Text accessibilityLabel="Landmark">{editor.landmark}</Text>
      <Text accessibilityLabel="pin caption">{editor.pinCaption ?? ""}</Text>
      <Text accessibilityLabel="notice">{editor.notice ?? ""}</Text>
      <Text accessibilityLabel="pin">
        {editor.point ? `${editor.point.lat},${editor.point.lng}` : ""}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Use SM City Davao"
        onPress={() => editor.pickSearch(HIT)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Drop pin"
        onPress={() => editor.pickPin(PIN)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Drop pin outside"
        onPress={() => editor.pickPin({ lat: 14.5995, lng: 120.9842 })}
      />
    </>
  );
}

describe("useDropoffEditor", () => {
  beforeEach(() => {
    jest.spyOn(geocode, "reverseNominatim").mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("fills the street and pin when a search hit is picked", async () => {
    await render(<Harness />);
    fireEvent.press(screen.getByLabelText("Use SM City Davao"));
    await waitFor(() => {
      expect(screen.getByLabelText("Street and building").props.children).toBe(
        "SM City Davao, Quimpo Boulevard",
      );
    });
    expect(screen.getByLabelText("pin").props.children).toBe("7.0494,125.588");
    expect(screen.getByLabelText("pin caption").props.children).toBe(
      "SM City Davao, Quimpo Boulevard, Matina, Davao City",
    );
  });

  it("fills the street from a pin when the field is empty", async () => {
    jest.spyOn(geocode, "reverseNominatim").mockResolvedValue(OK);
    await render(<Harness />);
    fireEvent.press(screen.getByLabelText("Drop pin"));
    await waitFor(() => {
      expect(screen.getByLabelText("Street and building").props.children).toBe(
        "12 J.P. Laurel Avenue",
      );
    });
    expect(screen.getByLabelText("pin").props.children).toBe("7.0731,125.6128");
    expect(screen.getByLabelText("pin caption").props.children).toBe(
      "12 J.P. Laurel Avenue, Bajada, Davao City",
    );
    expect(geocode.reverseNominatim).toHaveBeenCalledWith(PIN, expect.any(String));
  });

  it("does not fill a street when the pin is outside Davao", async () => {
    jest.spyOn(geocode, "reverseNominatim").mockResolvedValue({
      status: "outside_davao",
      message: geocode.OUTSIDE_DAVAO,
    });
    await render(<Harness />);
    fireEvent.press(screen.getByLabelText("Drop pin outside"));
    await waitFor(() => {
      expect(screen.getByLabelText("notice").props.children).toBe(geocode.OUTSIDE_DAVAO);
    });
    expect(screen.getByLabelText("Street and building").props.children).toBe("");
    expect(screen.getByLabelText("pin caption").props.children).toBe("");
  });

  it("does not invent a street when OSM has none", async () => {
    jest.spyOn(geocode, "reverseNominatim").mockResolvedValue({
      status: "empty",
      message: geocode.STREET_UNREAD,
    });
    await render(<Harness />);
    fireEvent.press(screen.getByLabelText("Drop pin"));
    await waitFor(() => {
      expect(screen.getByLabelText("pin caption").props.children).toBe(geocode.STREET_UNREAD);
    });
    expect(screen.getByLabelText("Street and building").props.children).toBe("");
  });

  it("fills an empty landmark from reverse", async () => {
    jest.spyOn(geocode, "reverseNominatim").mockResolvedValue(OK);
    await render(<Harness />);
    fireEvent.press(screen.getByLabelText("Drop pin"));
    await waitFor(() => {
      expect(screen.getByLabelText("Landmark").props.children).toBe("Insular Building");
    });
  });
});
