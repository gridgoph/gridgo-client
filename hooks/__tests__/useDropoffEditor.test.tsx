import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import type { DropoffSuggestion } from "@/lib/geocode";

const HIT: DropoffSuggestion = {
  id: "42",
  label: "SM City Davao",
  line1: "SM City Davao, Quimpo Boulevard",
  landmark: "",
  point: { lat: 7.0494, lng: 125.588 },
};

function Harness() {
  const editor = useDropoffEditor({ skipPrePin: true });
  return (
    <>
      <Text accessibilityLabel="Street and building">{editor.line1}</Text>
      <Text accessibilityLabel="pin">{editor.point ? `${editor.point.lat},${editor.point.lng}` : ""}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Use SM City Davao" onPress={() => editor.pickSearch(HIT)} />
    </>
  );
}

describe("useDropoffEditor", () => {
  it("fills the street and pin when a search hit is picked", async () => {
    await render(<Harness />);
    fireEvent.press(screen.getByLabelText("Use SM City Davao"));
    await waitFor(() => {
      expect(screen.getByLabelText("Street and building").props.children).toBe(
        "SM City Davao, Quimpo Boulevard",
      );
    });
    expect(screen.getByLabelText("pin").props.children).toBe("7.0494,125.588");
  });
});
