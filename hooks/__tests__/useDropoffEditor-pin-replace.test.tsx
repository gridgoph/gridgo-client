import { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

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
    landmark: "Insular Building",
    completeAddress: "12 J.P. Laurel Avenue, Bajada, Davao City",
    point: PIN,
  },
};

function Harness() {
  const editor = useDropoffEditor({ skipPrePin: true });
  useEffect(() => {
    editor.setLine1("Old street");
    editor.setLandmark("blue gate");
    // Seed once; setLine1/setLandmark are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Text accessibilityLabel="Street and building">{editor.line1}</Text>
      <Text accessibilityLabel="Landmark">{editor.landmark}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Drop pin"
        onPress={() => editor.pickPin(PIN)}
      />
    </>
  );
}

describe("useDropoffEditor pin replace", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("replaces an existing street from a later pin, and keeps a typed landmark", async () => {
    jest.spyOn(geocode, "reverseNominatim").mockResolvedValue(OK);
    await render(<Harness />);
    await waitFor(() => {
      expect(screen.getByLabelText("Street and building").props.children).toBe("Old street");
    });
    fireEvent.press(screen.getByLabelText("Drop pin"));
    await waitFor(() => {
      expect(screen.getByLabelText("Street and building").props.children).toBe(
        "12 J.P. Laurel Avenue",
      );
    });
    expect(screen.getByLabelText("Landmark").props.children).toBe("blue gate");
  });
});
