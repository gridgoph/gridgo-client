import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { formatDateTyping, manilaToday } from "@/lib/clientApplication";
import { customRangeProblem } from "@/lib/organization";
import { useStatements } from "@/store/statements";

/**
 * A custom statement period (gridgo-client#160). Its own short form, so the
 * Organizations tab stays free of fields and the keyboard has a screen built
 * for it. Dates are Manila calendar days, inclusive, a year at most.
 */
export default function StatementPeriodScreen() {
  const current = useStatements.getState();
  const today = manilaToday();
  const [from, setFrom] = useState(current.customFrom || `${today.slice(0, 8)}01`);
  const [to, setTo] = useState(current.customTo || today);
  const [tried, setTried] = useState(false);
  const problem = customRangeProblem(from, to);

  function show() {
    setTried(true);
    if (problem) return;
    useStatements.setState({ kind: "custom" });
    useStatements.getState().setCustom({ from, to });
    router.back();
  }

  return (
    <FormScreen>
      <View className="gg-page gap-6 pb-16 pt-4">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary" accessibilityRole="header">
            Choose the dates
          </Text>
          <Text className="text-body-lg text-text-secondary">
            Orders count on the day they were completed. Both days are included.
          </Text>
        </View>
        <FormField label="From" helper="YYYY-MM-DD">
          <TextField
            value={from}
            onChangeText={(value) => setFrom(formatDateTyping(value))}
            placeholder="YYYY-MM-DD"
            accessibilityLabel="From"
            keyboardType="number-pad"
            maxLength={10}
          />
        </FormField>
        <FormField label="To" helper="YYYY-MM-DD" error={tried ? problem : null}>
          <TextField
            value={to}
            onChangeText={(value) => setTo(formatDateTyping(value))}
            placeholder="YYYY-MM-DD"
            accessibilityLabel="To"
            keyboardType="number-pad"
            maxLength={10}
          />
        </FormField>
        <PrimaryButton label="Show statement" onPress={show} />
      </View>
    </FormScreen>
  );
}
