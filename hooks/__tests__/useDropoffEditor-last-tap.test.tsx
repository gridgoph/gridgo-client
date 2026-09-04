import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import * as geocode from "@/lib/geocode";
import type { GeocodeResult } from "@/lib/geocode";

const FIRST = { lat: 7.0731, lng: 125.6128 };
const SECOND = { lat: 7.0494, lng: 125.588 };

const firstOk: GeocodeResult = {
  status: "ok",
  suggestion: {
    id: "first",
    label: "First street",
    line1: "First street",
    landmark: "",
    completeAddress: "First street, Davao City",
    point: FIRST,
  },
};

const secondOk: GeocodeResult = {
  status: "ok",
  suggestion: {
    id: "second",
    label: "Second street",
    line1: "Second street",
    landmark: "",
    completeAddress: "Second street, Davao City",
    point: SECOND,
  },
};

function Harness() {
  const editor = useDropoffEditor({ skipPrePin: true });
  return (
    <>
      <Text accessibilityLabel="Street and building">{editor.line1}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Drop first"
        onPress={() => editor.pickPin(FIRST)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Drop second"
        onPress={() => editor.pickPin(SECOND)}
      />
    </>
  );
}

describe("useDropoffEditor last tap", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("ignores a stale reverse from an earlier tap", async () => {
    let resolveFirst: (value: GeocodeResult) => void = () => undefined;
    const firstPending = new Promise<GeocodeResult>((resolve) => {
      resolveFirst = resolve;
    });
    const reverse = jest.spyOn(geocode, "reverseNominatim");
    reverse.mockImplementationOnce(() => firstPending);
    reverse.mockResolvedValueOnce(secondOk);

    await render(<Harness />);
    fireEvent.press(screen.getByLabelText("Drop first"));
    fireEvent.press(screen.getByLabelText("Drop second"));

    await waitFor(() => {
      expect(screen.getByLabelText("Street and building").props.children).toBe("Second street");
    });

    await act(async () => {
      resolveFirst(firstOk);
    });
    expect(screen.getByLabelText("Street and building").props.children).toBe("Second street");
  });
});
