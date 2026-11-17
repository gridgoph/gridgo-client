import { fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import { DRAG_TO_DOOR } from "@/lib/dropoffPin";
import { suggestionFromNominatim, type NominatimHit } from "@/lib/geocode";

// The live "Deca Homes" hit: a landuse polygon. It filled the street with the
// subdivision's name, showed no hint, and saved (#432 review, C5).
const DECA_HOMES: NominatimHit = {
  place_id: 10,
  lat: "7.0866627",
  lon: "125.5345379",
  name: "Deca Homes",
  category: "landuse",
  type: "residential",
  address: { residential: "Deca Homes", quarter: "Awa", suburb: "Catalunan Grande", city: "Davao City" },
};
const picked = suggestionFromNominatim(DECA_HOMES);

function Harness() {
  const editor = useDropoffEditor({ skipPrePin: true });
  return (
    <>
      <Text accessibilityLabel="street">{editor.line1}</Text>
      <Text accessibilityLabel="ready">{editor.ready ? "yes" : "no"}</Text>
      <Text accessibilityLabel="title">{editor.pin.title}</Text>
      <Text accessibilityLabel="hint">{editor.pin.hint ?? ""}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pick"
        onPress={() => picked.status === "ok" && editor.pickSearch(picked.suggestion)}
      />
    </>
  );
}

it("picks a subdivision as a place to look: no street, the drag-to-door hint, not ready", async () => {
  expect(picked.status).toBe("ok");
  await render(<Harness />);
  fireEvent.press(screen.getByLabelText("Pick"));
  expect(await screen.findByText(`This is the middle of Deca Homes. ${DRAG_TO_DOOR}`)).toBeTruthy();
  expect(screen.getByLabelText("street").props.children).toBe("");
  expect(screen.getByLabelText("title").props.children).toBe("Deca Homes");
  expect(screen.getByLabelText("ready").props.children).toBe("no");
});
