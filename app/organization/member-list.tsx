import { router, useFocusEffect } from "expo-router";
import { FileText, Pencil, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CheckboxRow } from "@/components/form/CheckboxRow";
import { MemberLabel, PartnerGate, ProblemLine, TextButton } from "@/components/organization/MemberParts";
import { Pressable } from "@/components/Pressable";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useMemberListFile } from "@/hooks/useMemberListFile";
import { useThemeColors } from "@/hooks/useTheme";
import { LIST_COLUMNS, LIST_ROW_LIMIT } from "@/lib/memberListCsv";
import {
  countOf,
  inviteEvening,
  MEMBER_INVITE_ROUTE,
  MEMBER_LIST_ROW_ROUTE,
  MEMBER_WAITING_ROUTE,
  monthYear,
  saveListLabel,
} from "@/lib/organizationMembers";
import { readyRows, useMemberListDraft, type DraftRow } from "@/store/memberListDraft";
import { useOrganizationMembers } from "@/store/organizationMembers";

/**
 * Invite → Upload member list: choose, check, fix, send (gridgo-client#474).
 *
 * Nothing leaves the phone until Check list, and nobody is a member until they
 * confirm for themselves. The check counts emails, mobiles and rows to fix and
 * never says who already has an account, because GRIDGO never tells us.
 */
export default function MemberListScreen() {
  const step = useMemberListDraft((s) => s.step);

  useFocusEffect(
    useCallback(() => {
      if (!useOrganizationMembers.getState().summary) void useOrganizationMembers.getState().loadSummary();
    }, []),
  );

  // A finished list is not shown again on the next visit; an unsent one waits here.
  useEffect(
    () => () => {
      if (useMemberListDraft.getState().step === "saved") useMemberListDraft.getState().reset();
    },
    [],
  );

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen" key={step}>
        <PartnerGate>
          <View className="gg-page gap-6 pb-16 pt-4">
            {step === "choose" ? <Choose /> : step === "checked" ? <Checked /> : <Saved />}
          </View>
        </PartnerGate>
      </ScrollView>
    </Screen>
  );
}

/* --------------------------------------------------------------------------
   1. Choose
   -------------------------------------------------------------------------- */

const ROWS_SHOWN = 20;

function Choose() {
  const rows = useMemberListDraft((s) => s.rows);
  const fileName = useMemberListDraft((s) => s.fileName);
  const consent = useMemberListDraft((s) => s.consent);
  const checking = useMemberListDraft((s) => s.checking);
  const error = useMemberListDraft((s) => s.error);
  const fileError = useMemberListDraft((s) => s.fileError);
  const label = useOrganizationMembers((s) => s.summary?.label ?? "your organization");
  const { choose, reading } = useMemberListFile();
  const [tried, setTried] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  const store = useMemberListDraft.getState();
  const shown = showAll ? rows : rows.slice(0, ROWS_SHOWN);

  return (
    <>
      <View className="gap-1">
        <Text className="text-h2 text-text-primary" accessibilityRole="header">
          Add members you already have
        </Text>
        <Text className="text-body text-text-secondary">
          Choose a file, or add people one by one. Each person confirms with one tap before they become a member.
        </Text>
      </View>

      {rows.length ? (
        <View className="gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-body-lg font-medium text-text-primary">{countOf(rows.length, "person", "people")}</Text>
              {fileName ? (
                <Text className="text-caption text-text-muted" numberOfLines={1}>
                  From {fileName}
                </Text>
              ) : null}
            </View>
            <TextButton label="Clear list" disabled={checking} onPress={() => setClearing(true)} />
          </View>
          <View className="gg-card-flush">
            {shown.map((row, index) => (
              <DraftRowLine key={row.key} row={row} divided={index > 0} disabled={checking} />
            ))}
          </View>
          {rows.length > shown.length ? (
            <TextButton label={`Show all ${rows.length.toLocaleString("en-PH")}`} onPress={() => setShowAll(true)} />
          ) : null}
        </View>
      ) : (
        <FileCard onChoose={() => void choose()} reading={reading} />
      )}

      <View className="gap-3">
        {fileError ? <ProblemLine message={fileError} /> : null}
        <SecondaryButton
          label={rows.length ? "Add another person" : "Add one by one"}
          disabled={checking || rows.length >= LIST_ROW_LIMIT}
          onPress={() => router.push(MEMBER_LIST_ROW_ROUTE)}
        />
        {rows.length ? (
          <SecondaryButton label={reading ? "Opening…" : "Choose a different file"} disabled={checking || reading} onPress={() => void choose()} />
        ) : null}
      </View>

      <View className="gap-2">
        <Text className="text-overline text-text-muted">WHAT MEMBERS SEE</Text>
        <View className="gg-card gap-2">
          <Text className="text-body-lg font-medium text-text-primary">Are you a member of {label}?</Text>
          <Text className="text-body text-text-secondary">
            One tap to confirm, then they get their label with the date from your list.
          </Text>
          <MemberLabel label={label} />
        </View>
      </View>

      {rows.length ? (
        <View className="gap-3">
          <View className="gg-card py-2">
            <CheckboxRow
              checked={consent}
              onChange={store.setConsent}
              disabled={checking}
              label="Our members agreed that we can share their name and contact with GRIDGO for this."
              hint="Contacts are used only for this invite, then deleted."
            />
          </View>
          {tried && !consent ? <ProblemLine message="Tick the box first: your members need to have agreed to this." /> : null}
          {error ? <ProblemLine message={error} /> : null}
          <PrimaryButton
            label={checking ? "Checking…" : "Check list"}
            disabled={checking}
            onPress={() => {
              setTried(true);
              if (consent) void store.check();
            }}
          />
        </View>
      ) : null}

      <ConfirmDialog
        visible={clearing}
        question={`Clear ${countOf(rows.length, "person", "people")} from this list?`}
        body="Nothing has been sent. Anyone you typed in has to be added again."
        confirmLabel="Clear list"
        cancelLabel="Keep list"
        tone="destructive"
        onConfirm={() => {
          setClearing(false);
          store.reset();
        }}
        onCancel={() => setClearing(false)}
      />
    </>
  );
}

function FileCard({ onChoose, reading }: { onChoose: () => void; reading: boolean }) {
  const colors = useThemeColors();
  return (
    <View className="gg-card gap-4">
      <View className="flex-row items-start gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-field bg-surface-variant">
          <FileText size={22} color={colors.textPrimary} strokeWidth={2} aria-hidden />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body-lg font-medium text-text-primary">CSV file with three columns</Text>
          <Text className="text-body text-text-secondary">{LIST_COLUMNS.join(", ")}</Text>
          <Text className="text-caption text-text-muted">
            The first row is the column names. Up to {LIST_ROW_LIMIT} people at a time.
          </Text>
        </View>
      </View>
      <View className="gg-panel gap-1" accessible accessibilityLabel="Example row: Sample Member, sample at example dot com, Aug 2024">
        <Text className="text-caption text-text-muted">{LIST_COLUMNS.join(",")}</Text>
        <Text className="text-caption text-text-secondary">Sample Member,sample@example.com,Aug 2024</Text>
      </View>
      <PrimaryButton label={reading ? "Opening…" : "Choose file"} disabled={reading} onPress={onChoose} />
    </View>
  );
}

function rowName(row: DraftRow): string {
  return row.name.trim() || row.contact.trim() || "No name";
}

function DraftRowLine({ row, divided, disabled }: { row: DraftRow; divided: boolean; disabled: boolean }) {
  return (
    <View className={divided ? "flex-row items-center border-t border-outline-subtle py-1 pl-4 pr-1" : "flex-row items-center py-1 pl-4 pr-1"}>
      <View className="min-w-0 flex-1 gap-0.5 py-2">
        <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
          {rowName(row)}
        </Text>
        <Text className="text-caption text-text-muted" numberOfLines={1}>
          {[row.contact, monthYear(row.memberSince) ?? row.memberSince].filter((part) => part.trim()).join(" · ") || "No contact"}
        </Text>
      </View>
      <RowIcon icon="edit" label={`Edit ${rowName(row)}`} disabled={disabled} onPress={() => openRow(row.key)} />
      <RowIcon icon="remove" label={`Take ${rowName(row)} off the list`} disabled={disabled} onPress={() => useMemberListDraft.getState().drop(row.key)} />
    </View>
  );
}

function RowIcon({ icon, label, onPress, disabled }: { icon: "edit" | "remove"; label: string; onPress: () => void; disabled: boolean }) {
  const colors = useThemeColors();
  const Glyph = icon === "edit" ? Pencil : X;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={disabled ? "gg-touch gg-disabled items-center justify-center" : "gg-touch items-center justify-center"}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <Glyph size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
    </Pressable>
  );
}

const openRow = (key: string) => router.push({ pathname: MEMBER_LIST_ROW_ROUTE, params: { key } });

/* --------------------------------------------------------------------------
   2. Checked
   -------------------------------------------------------------------------- */

function Checked() {
  const rows = useMemberListDraft((s) => s.rows);
  const fixes = useMemberListDraft((s) => s.fixes);
  const totals = useMemberListDraft((s) => s.totals);
  const saving = useMemberListDraft((s) => s.saving);
  const error = useMemberListDraft((s) => s.error);
  const consent = useMemberListDraft((s) => s.consent);
  const store = useMemberListDraft.getState();
  const ready = readyRows({ rows, fixes });

  return (
    <>
      <View className="gap-1">
        <Text className="text-h2 text-text-primary" accessibilityRole="header">
          {ready.length ? `${countOf(ready.length, "person", "people")} ready` : "Nobody is ready yet"}
        </Text>
        <Text className="text-body text-text-secondary">
          {fixes.length
            ? `${countOf(fixes.length, "row needs", "rows need")} a fix. You can fix ${fixes.length === 1 ? "it" : "them"} now, or leave ${fixes.length === 1 ? "it" : "them"} out.`
            : ready.length
              ? "Everyone on the list can be saved. Nothing is sent until you save."
              : "Go back and add people to your list."}
        </Text>
      </View>

      {totals.emailCount || totals.mobileCount || totals.alreadyListedCount ? (
        <View className="gg-card-flush">
          <CountLine label="With an email" detail="They can confirm in the app, or GRIDGO emails them an invite" value={totals.emailCount} />
          <CountLine divided label="With a mobile number" detail="They confirm in the app with that number. GRIDGO does not text them" value={totals.mobileCount} />
          {totals.alreadyListedCount ? (
            <CountLine divided label="Already on your list" detail="Their name and date are updated. They are not invited twice" value={totals.alreadyListedCount} />
          ) : null}
        </View>
      ) : null}

      {fixes.length ? (
        <View className="gap-2">
          <Text className="text-overline text-text-muted">TO FIX · {fixes.length.toLocaleString("en-PH")}</Text>
          <View className="gg-card-flush">
            {fixes.map((fix, index) => {
              const row = rows.find((entry) => entry.key === fix.key);
              return row ? <FixLine key={fix.key} row={row} message={fix.message} divided={index > 0} disabled={saving} /> : null;
            })}
          </View>
        </View>
      ) : null}

      <View className="gap-3">
        {ready.length ? (
          <Text className="text-body text-text-secondary">
            Nobody becomes a member until they confirm. Emails to people not yet on GRIDGO go out {inviteEvening()}.
          </Text>
        ) : null}
        {!consent ? (
          <View className="gg-card py-2">
            <CheckboxRow
              checked={consent}
              onChange={store.setConsent}
              label="Our members agreed that we can share their name and contact with GRIDGO for this."
              hint="Contacts are used only for this invite, then deleted."
            />
          </View>
        ) : null}
        {error ? <ProblemLine message={error} /> : null}
        {ready.length ? (
          <PrimaryButton
            label={saving ? "Saving…" : saveListLabel(ready.length)}
            disabled={saving || !consent}
            onPress={() => void store.save()}
          />
        ) : null}
        <SecondaryButton label="Back to the list" disabled={saving} onPress={store.backToChoose} />
      </View>
    </>
  );
}

function CountLine({ label, detail, value, divided = false }: { label: string; detail: string; value: number; divided?: boolean }) {
  return (
    <View
      className={divided ? "flex-row items-center gap-3 border-t border-outline-subtle px-4 py-3" : "flex-row items-center gap-3 px-4 py-3"}
      accessible
      accessibilityLabel={`${label}: ${value}. ${detail}`}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">{label}</Text>
        <Text className="text-caption text-text-muted">{detail}</Text>
      </View>
      <Text className="text-h3 text-text-primary">{value.toLocaleString("en-PH")}</Text>
    </View>
  );
}

function FixLine({ row, message, divided, disabled }: { row: DraftRow; message: string; divided: boolean; disabled: boolean }) {
  const colors = useThemeColors();
  return (
    <View className={divided ? "flex-row items-center border-t border-outline-subtle py-1 pl-4 pr-1" : "flex-row items-center py-1 pl-4 pr-1"}>
      <View className="min-w-0 flex-1 gap-0.5 py-2">
        <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
          {rowName(row)}
        </Text>
        <Text className="text-caption text-error">{message}</Text>
      </View>
      <Pressable
        onPress={() => openRow(row.key)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Fix ${rowName(row)}`}
        className="gg-touch items-center justify-center px-3"
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      >
        <Text className="text-button text-text-primary underline">Fix</Text>
      </Pressable>
      <Pressable
        onPress={() => useMemberListDraft.getState().drop(row.key)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Take ${rowName(row)} off the list`}
        className="gg-touch items-center justify-center"
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      >
        <X size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      </Pressable>
    </View>
  );
}

/* --------------------------------------------------------------------------
   3. Saved
   -------------------------------------------------------------------------- */

function Saved() {
  const savedCount = useMemberListDraft((s) => s.savedCount);
  const savedEmailCount = useMemberListDraft((s) => s.savedEmailCount);
  const left = useMemberListDraft((s) => s.fixes.length);
  const store = useMemberListDraft.getState();

  return (
    <>
      <View className="gap-1">
        <Text className="text-h2 text-text-primary" accessibilityRole="header" accessibilityLiveRegion="polite">
          {countOf(savedCount, "person", "people")} saved
        </Text>
        <Text className="text-body text-text-secondary">
          They are on your list, not members yet. Each one becomes a member when they confirm.
        </Text>
      </View>

      <View className="gg-card gap-3">
        <Text className="text-overline text-text-muted">WHAT HAPPENS NEXT</Text>
        <Text className="text-body text-text-primary">
          People with GRIDGO see the question the next time they open the app.
        </Text>
        {savedEmailCount ? (
          <Text className="text-body text-text-primary">
            Email addresses not yet on GRIDGO get one invite {inviteEvening()}, and one reminder a week later.
          </Text>
        ) : null}
        <Text className="text-body text-text-primary">
          Anyone else can use your link or QR.
        </Text>
      </View>

      {left ? (
        <View className="gg-card gap-3">
          <Text className="text-body-lg font-medium text-text-primary">
            {countOf(left, "row was", "rows were")} left out
          </Text>
          <Text className="text-body text-text-secondary">Fix {left === 1 ? "it" : "them"} now to send {left === 1 ? "it" : "them"} too.</Text>
          <SecondaryButton label={left === 1 ? "Fix this row" : "Fix these rows"} onPress={store.fixRest} />
        </View>
      ) : null}

      <View className="gap-3">
        <PrimaryButton label="Done" onPress={() => router.dismissTo(MEMBER_INVITE_ROUTE)} />
        <SecondaryButton label="See who is waiting" onPress={() => router.replace(MEMBER_WAITING_ROUTE)} />
      </View>
    </>
  );
}
