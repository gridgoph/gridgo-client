import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import { OUTSIDE_TITLE } from "@/lib/dropoffPin";
import * as geocode from "@/lib/geocode";

// Inside the city box, but the reverse lookup names another town (the box's
// north-east corner reaches Panabo). Regression for #432 review C2.
const EDGE = { lat: 7.3, lng: 125.69 };

function Harness() {
  const editor = useDropoffEditor({ skipPrePin: true });
  return (
    <>
      <Text accessibilityLabel="ready">{editor.ready ? "yes" : "no"}</Text>
      <Text accessibilityLabel="pin title">{editor.pin.title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Type then drop"
        onPress={() => {
          editor.setLine1("Typed street, near the port");
          editor.pickPin(EDGE);
        }}
      />
    </>
  );
}

it("keeps the reverse lookup's outside-Davao answer for that pin and refuses to save it", async () => {
  expect(geocode.pointInDavao(EDGE)).toBe(true);
  jest.spyOn(geocode, "reverseNominatim").mockResolvedValue({
    status: "outside_davao",
    message: geocode.OUTSIDE_DAVAO,
  });
  await render(<Harness />);
  fireEvent.press(screen.getByLabelText("Type then drop"));
  await waitFor(() => expect(screen.getByLabelText("pin title").props.children).toBe(OUTSIDE_TITLE));
  // A typed street does not make an outside pin saveable.
  expect(screen.getByLabelText("ready").props.children).toBe("no");
});
