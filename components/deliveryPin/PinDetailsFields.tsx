import { View } from "react-native";

import { CheckboxRow } from "@/components/form/CheckboxRow";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { PIN_NOTES_MAX, PIN_RECEIVER_MAX } from "@/lib/deliveryPin";

export type PinDetails = {
  notes: string;
  someoneElse: boolean;
  receiverName: string;
};

export function pinDetailsFrom(pin: { notes: string; receiverName: string }): PinDetails {
  return { notes: pin.notes, someoneElse: Boolean(pin.receiverName.trim()), receiverName: pin.receiverName };
}

/** The receiver the API stores: empty means the client. */
export function receiverFor(details: PinDetails): string {
  return details.someoneElse ? details.receiverName.trim() : "";
}

/** The first thing that stops these details being sent, or null. */
export function pinDetailsProblem(details: PinDetails): string | null {
  if (details.notes.trim().length > PIN_NOTES_MAX) return `Keep the notes to ${PIN_NOTES_MAX} characters.`;
  if (details.someoneElse && !details.receiverName.trim()) return "Enter the name of the person receiving it.";
  if (details.receiverName.trim().length > PIN_RECEIVER_MAX) return `Keep the name to ${PIN_RECEIVER_MAX} characters.`;
  return null;
}

/**
 * Notes for the rider and who meets them. A name only — no phone number is
 * asked for or shown; contact stays masked through GRIDGO.
 */
export function PinDetailsFields({
  value,
  onChange,
  disabled = false,
}: {
  value: PinDetails;
  onChange: (next: PinDetails) => void;
  disabled?: boolean;
}) {
  return (
    <View className="gap-4">
      <FormField label="Notes for the rider" optional helper="A gate, a floor, a shop sign — what to look for when they arrive.">
        <TextField
          value={value.notes}
          onChangeText={(notes) => onChange({ ...value, notes })}
          placeholder="Blue gate beside the pharmacy"
          accessibilityLabel="Notes for the rider"
          autoCapitalize="sentences"
          maxLength={PIN_NOTES_MAX}
          editable={!disabled}
        />
      </FormField>
      <CheckboxRow
        checked={value.someoneElse}
        onChange={(someoneElse) => onChange({ ...value, someoneElse })}
        label="Someone else will receive it"
        hint="The rider is given their name only. Phone numbers stay private."
        disabled={disabled}
      />
      {value.someoneElse ? (
        <FormField label="Their name">
          <TextField
            value={value.receiverName}
            onChangeText={(receiverName) => onChange({ ...value, receiverName })}
            placeholder="Who will meet the rider"
            accessibilityLabel="Name of the person receiving it"
            autoCapitalize="words"
            maxLength={PIN_RECEIVER_MAX}
            editable={!disabled}
          />
        </FormField>
      ) : null}
    </View>
  );
}
