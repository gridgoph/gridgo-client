import { View } from "react-native";

import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import type { useDropoffEditor } from "@/hooks/useDropoffEditor";
import { ADDRESS_LABEL_MAX, DELIVERY_CITY } from "@/lib/address";

type Editor = ReturnType<typeof useDropoffEditor>;

/** Name, street, landmark under the pin. */
export function DropoffDetails({
  editor,
  labelLocked = false,
  namePlaceholder = "Home",
}: {
  editor: Editor;
  /** Home / Work from Saved Places — the name is the destination, not a field. */
  labelLocked?: boolean;
  namePlaceholder?: string;
}) {
  return (
    <View className="gap-5">
      {labelLocked ? null : (
        <FormField
          label="Name this place"
          optional
          helper="“Home”, “Work”, “Shop” — so you can pick it next time."
        >
          <TextField
            value={editor.label}
            onChangeText={editor.setLabel}
            placeholder={namePlaceholder}
            accessibilityLabel="Name this place"
            maxLength={ADDRESS_LABEL_MAX}
            autoCapitalize="words"
          />
        </FormField>
      )}

      <FormField
        label="Street and building"
        error={editor.touched && editor.addressCheck.field === "line1" ? editor.addressCheck.reason : null}
        helper={`Number, street and building. ${DELIVERY_CITY} is assumed.`}
      >
        <TextField
          value={editor.line1}
          onChangeText={editor.setLine1}
          placeholder="12 Quimpo Blvd, Unit 3"
          accessibilityLabel="Street and building"
          autoCapitalize="words"
        />
      </FormField>

      <FormField
        label="Landmark"
        optional
        helper="What the rider should look for when they are on the street."
      >
        <TextField
          value={editor.landmark}
          onChangeText={editor.setLandmark}
          placeholder="Beside the blue gate"
          accessibilityLabel="Landmark"
          autoCapitalize="sentences"
        />
      </FormField>
    </View>
  );
}
