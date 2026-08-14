import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { PasswordField } from "@/components/form/PasswordField";
import { TextField } from "@/components/form/TextField";

describe("native text field insets", () => {
  it("passes a generous Android-safe inset to the native TextInput", async () => {
    const view = await render(
      <TextField
        value=""
        onChangeText={() => undefined}
        placeholder="Job title"
        accessibilityLabel="Job title"
      />,
    );

    const style = StyleSheet.flatten(view.getByLabelText("Job title").props.style);
    expect(style).toEqual(
      expect.objectContaining({
        paddingStart: 28,
        paddingEnd: 28,
        includeFontPadding: false,
        textAlignVertical: "center",
      }),
    );
  });

  it("insets passwords from the start and clears the trailing eye control", async () => {
    const view = await render(
      <PasswordField
        value=""
        onChangeText={() => undefined}
        placeholder="Password"
        accessibilityLabel="Password"
      />,
    );

    const style = StyleSheet.flatten(view.getByLabelText("Password").props.style);
    expect(style).toEqual(
      expect.objectContaining({
        paddingStart: 28,
        paddingEnd: 64,
        includeFontPadding: false,
        textAlignVertical: "center",
      }),
    );
  });

  it("keeps multiline copy top-aligned without losing its native inset", async () => {
    const view = await render(
      <TextField
        value=""
        onChangeText={() => undefined}
        placeholder="Describe the change"
        accessibilityLabel="Describe the change"
        multiline
      />,
    );

    const style = StyleSheet.flatten(view.getByLabelText("Describe the change").props.style);
    expect(style).toEqual(
      expect.objectContaining({
        paddingStart: 28,
        paddingEnd: 28,
        includeFontPadding: false,
        textAlignVertical: "top",
      }),
    );
  });
});
