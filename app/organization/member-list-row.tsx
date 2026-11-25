import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { FormScreen } from "@/components/FormScreen";
import { MemberSinceField, ProblemLine } from "@/components/organization/MemberParts";
import { PrimaryButton } from "@/components/PrimaryButton";
import { listContact } from "@/lib/memberListCsv";
import { pickFrom, pickProblem, pickValue, type MonthPick } from "@/lib/organizationMembers";
import { useMemberListDraft } from "@/store/memberListDraft";

/**
 * One person on the member list: added by hand, changed, or fixed.
 *
 * A row GRIDGO sent back is checked again on its own before it counts as
 * fixed. A row not checked yet only has to be filled in.
 */
export default function MemberListRowScreen() {
  const { key } = useLocalSearchParams<{ key?: string }>();
  const row = useMemberListDraft((s) => s.rows.find((entry) => entry.key === key) ?? null);
  const reason = useMemberListDraft((s) => s.fixes.find((fix) => fix.key === key)?.message ?? null);
  const fixing = useMemberListDraft((s) => s.fixing);
  const fixError = useMemberListDraft((s) => s.fixError);
  const [name, setName] = useState(row?.name ?? "");
  const [contact, setContact] = useState(row?.contact ?? "");
  const [pick, setPick] = useState<MonthPick>(() => pickFrom(row?.memberSince));
  const [tried, setTried] = useState(false);

  useEffect(() => useMemberListDraft.setState({ fixError: null }), []);

  const busy = fixing !== null;
  const since = pickValue(pick);

  const submit = async () => {
    setTried(true);
    if (!name.trim() || !contact.trim() || !since) return;
    const store = useMemberListDraft.getState();
    const next = {
      name: name.trim(),
      contact: listContact(contact),
      // A full date from the file is kept while its month is unchanged.
      memberSince: row?.memberSince.startsWith(since) ? row.memberSince : since,
    };
    if (!row) {
      store.add(next);
      router.back();
    } else if (reason) {
      if (await store.fix(row.key, next)) router.back();
    } else {
      store.update(row.key, next);
      router.back();
    }
  };

  return (
    <FormScreen>
      <View className="gg-page gap-6 pb-16 pt-4">
        <View className="gap-1">
          <Text className="text-h2 text-text-primary" accessibilityRole="header">
            {reason ? "Fix this row" : row ? "Change this person" : "Add a person"}
          </Text>
          <Text className="text-body text-text-secondary">
            {reason ? `GRIDGO found: ${reason.toLowerCase()}.` : "They become a member when they confirm in the app."}
          </Text>
        </View>

        <FormField label="Name" error={tried && !name.trim() ? "Type their name." : null}>
          <TextField
            value={name}
            onChangeText={setName}
            accessibilityLabel="Name"
            autoCapitalize="words"
            maxLength={120}
            editable={!busy}
            invalid={tried && !name.trim()}
          />
        </FormField>

        <FormField
          label="Email or mobile"
          helper="The one they use on GRIDGO. A mobile number looks like 0917 123 4567."
          error={tried && !contact.trim() ? "Type their email or mobile number." : null}
        >
          <TextField
            value={contact}
            onChangeText={setContact}
            accessibilityLabel="Email or mobile"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={254}
            editable={!busy}
            invalid={tried && !contact.trim()}
          />
        </FormField>

        <FormField
          label="Member since"
          helper="The real month they joined your organization."
          error={tried ? pickProblem(pick) : null}
        >
          <MemberSinceField pick={pick} onChange={setPick} disabled={busy} />
        </FormField>

        <View className="gap-3">
          {fixError ? <ProblemLine message={fixError} /> : null}
          <PrimaryButton
            label={busy ? "Checking…" : reason ? "Check this row" : row ? "Save change" : "Add to list"}
            disabled={busy}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </FormScreen>
  );
}
