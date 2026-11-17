import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import * as geocode from "@/lib/geocode";

const PIN = { lat: 7.0731, lng: 125.6128 };

function Harness() {
  const editor = useDropoffEditor({ skipPrePin: true });
  return (
    <>
      <Text accessibilityLabel="ready">{editor.ready ? "yes" : "no"}</Text>
      <Text accessibilityLabel="reversing">{editor.reversing ? "yes" : "no"}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Type then drop"
        onPress={() => {
          editor.setLine1("Old street from before");
          editor.pickPin(PIN);
        }}
      />
    </>
  );
}

it("does not offer Save while a moved pin is still being read", async () => {
  jest.spyOn(geocode, "reverseNominatim").mockImplementation(() => new Promise(() => undefined));
  await render(<Harness />);
  fireEvent.press(screen.getByLabelText("Type then drop"));
  await waitFor(() => expect(screen.getByLabelText("reversing").props.children).toBe("yes"));
  expect(screen.getByLabelText("ready").props.children).toBe("no");
});
