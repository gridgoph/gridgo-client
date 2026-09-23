import { useUser } from "@clerk/expo";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ClientMonogram } from "@/components/ClientMonogram";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { useThemeColors } from "@/hooks/useTheme";
import type { User } from "@/lib/api";
import {
  accountHasOrgName,
  accountPatch,
  accountProblems,
  ACCOUNT_NOT_OPEN_YET,
  ACCOUNT_STALE,
  draftFromUser,
  hasAccountChanges,
  loadAccount,
  saveAccount,
  type AccountDraft,
  type AccountField,
  type AccountProblems,
} from "@/lib/accountProfile";
import {
  changeClientPhoto,
  clientIdentity,
  CLERK_NAME_KEPT,
  syncClerkName,
} from "@/lib/clerkIdentity";
import { accountTypeOption } from "@/lib/signup";
import { useSession } from "@/store/session";

/**
 * The client's own details, corrected by the client.
 *
 * Reached by tapping the identity card on Account, because that card is where
 * a wrong name is noticed.
 *
 * **Two owners meet here, and the layout says which is which.** Clerk holds
 * the sign-in — the photo, the address, the password — and GRIDGO holds the
 * product profile: the number, the organisation name, the account type. That
 * split is drawn as two different grammars rather than one wall of inputs.
 * What Clerk owns takes *steps*, so it is a row that states what the value is
 * now and leads somewhere; what GRIDGO owns takes *keystrokes*, so it is a
 * field, and the fields share one Save. A control that opens a screen and a
 * control you type into must not look alike.
 *
 * The name is the one thing both hold — Clerk's is what a person signs in as,
 * GRIDGO's is what a supplier reads on the job — so it is one field and the
 * save writes both.
 *
 * **Nothing here waits on the network to draw a person.** The captain's bug
 * was this screen sitting on grey skeleton bars forever: `load()` awaited
 * `GET /me` before it would build a draft, and the skeleton was
 * `loading && !draft`, so a `/me` that hung or answered 401 meant the form
 * never appeared at all — while Clerk had the person in memory and the session
 * had the account. So the identity block above is unconditional, the draft is
 * seeded from the session the moment the screen opens, and `/me` is a timed
 * refresh whose failure is one quiet line under details that are still true.
 *
 * Nothing is drawn to press until something has actually changed — a disabled
 * yellow button is not a state — and a save carries the version the account
 * was read at, so a change Operations made in the meantime is offered rather
 * than overwritten.
 */
export default function AccountDetailsScreen() {
  const { user: clerkUser } = useUser();
  const sessionUser = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);

  /**
   * The account starts as whatever the session already holds. `/me` refreshes
   * it; it is never what makes the screen appear.
   */
  const [account, setAccount] = useState<User | null>(sessionUser);
  const [draft, setDraft] = useState<AccountDraft | null>(() =>
    sessionUser ? draftFromUser(sessionUser) : null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [refusals, setRefusals] = useState<AccountProblems>({});
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  const [loadProblem, setLoadProblem] = useState<{
    kind: "not_open_yet" | "failed";
    message: string;
  } | null>(null);
  const [saveNotice, setSaveNotice] = useState<{
    message: string;
    reloadable: boolean;
    /** Overrides the default when the save did not simply fail. */
    label?: string;
  } | null>(null);

  // Clerk first, the session second, and never a wait for either. This is what
  // puts a name, an address and a photo on screen in the first frame.
  const identity = clientIdentity(clerkUser, account ?? sessionUser);

  /**
   * `adoptDraft` is the difference between the two reasons this runs. Opening
   * the screen must start from GRIDGO's values; asking for the latest after a
   * conflict is the one other case where they should replace what is typed.
   */
  const load = useCallback(
    async (adoptDraft: boolean, fallbackName: string) => {
      setLoading(true);
      const outcome = await loadAccount();
      setLoading(false);

      if (outcome.status === "ok") {
        setAccount(outcome.value);
        setDraft((current) =>
          adoptDraft || !current ? draftFromUser(outcome.value, fallbackName) : current,
        );
        setLoadProblem(null);
        if (adoptDraft) {
          setSaveNotice(null);
          setRefusals({});
          setShowProblems(false);
        }
        return;
      }

      setLoadProblem(
        outcome.status === "not_open_yet"
          ? { kind: "not_open_yet", message: ACCOUNT_NOT_OPEN_YET }
          : { kind: "failed", message: outcome.message },
      );
    },
    [],
  );

  useEffect(() => {
    // The name Clerk knows only fills a GRIDGO record that has none — see
    // `draftFromUser`. Read once at mount so a later Clerk re-render cannot
    // re-run the read.
    // `loading` already starts true, so the flag `load` raises cannot cascade
    // a render here; the async wrapper keeps the effect body itself free of
    // synchronous state writes.
    void (async () => {
      await load(true, identity.name);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  /**
   * A session that arrives after the first frame still gets a form.
   *
   * Behind `Stack.Protected` there is normally a user before this screen
   * mounts, so this is the belt to the seeding above's braces: what it must
   * never do is leave a signed-in client looking at placeholders because one
   * read was slow.
   */
  if (!draft && sessionUser) {
    // Adjusted during render rather than in an effect, so the form appears in
    // the same frame the session does instead of one paint later.
    setAccount((current) => current ?? sessionUser);
    setDraft(draftFromUser(sessionUser, identity.name));
  }

  const accountType = (account ?? sessionUser)?.accountType ?? "individual";
  const problems = draft ? accountProblems(draft, accountType) : {};
  const changed = account && draft ? hasAccountChanges(account, draft) : false;
  const showsOrgName = accountHasOrgName({ accountType });

  /** A refusal from GRIDGO always shows; a typo only after a save is tried. */
  function fieldError(field: AccountField): string | null {
    return refusals[field] ?? (showProblems ? (problems[field] ?? null) : null);
  }

  function edit(patch: Partial<AccountDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    // A refusal was about what was on screen a moment ago. The stale notice
    // stays, because editing does not resolve a change somebody else made.
    setRefusals({});
  }

  async function changePhoto() {
    if (!clerkUser || photoBusy) return;
    setPhotoBusy(true);
    setPhotoProblem(null);
    const outcome = await changeClientPhoto(clerkUser);
    setPhotoBusy(false);
    if (outcome.status === "failed") setPhotoProblem(outcome.message);
  }

  async function save() {
    if (!account || !draft || saving) return;

    if (Object.keys(accountProblems(draft, accountType)).length) {
      setShowProblems(true);
      return;
    }

    const patch = accountPatch(account, draft);
    if (!Object.keys(patch).length) return;

    setSaving(true);
    setSaveNotice(null);
    setRefusals({});
    // `/me` always answers with a version; `?? 1` is the same default the
    // server applies to a row that predates versioning, so a save built on an
    // older projection still quotes something GRIDGO can compare.
    const outcome = await saveAccount(patch, account.version ?? 1);

    if (outcome.status === "ok") {
      // GRIDGO's copy is the one a supplier prints against, so it is written
      // first and its refusal is what stops the save. The sign-in name catches
      // up afterwards, and is allowed to fail on its own without throwing away
      // a correction that already landed.
      if (patch.name && clerkUser) {
        const synced = await syncClerkName(clerkUser, patch.name);
        if (synced.status === "failed") {
          setAccount(outcome.value);
          setUser(outcome.value);
          setSaving(false);
          // GRIDGO took the change; only the sign-in's copy of the name did
          // not. Saying "Not saved" over the top of a save that landed would
          // send the client back to retype what is already stored.
          setSaveNotice({
            message: CLERK_NAME_KEPT,
            reloadable: false,
            label: "Sign-in name not updated",
          });
          return;
        }
      }
      setSaving(false);
      // Account reads this from the session, so it has to carry GRIDGO's
      // answer before this screen closes over it.
      setUser(outcome.value);
      router.back();
      return;
    }

    setSaving(false);

    if (outcome.status === "stale") {
      setSaveNotice({ message: ACCOUNT_STALE, reloadable: true });
      return;
    }

    if (outcome.status === "not_open_yet") {
      setSaveNotice({ message: ACCOUNT_NOT_OPEN_YET, reloadable: false });
      return;
    }

    if (outcome.field) {
      setRefusals({ [outcome.field]: outcome.message });
      return;
    }

    setSaveNotice({ message: outcome.message, reloadable: false });
  }

  const headline =
    draft?.orgName.trim() || identity.name || draft?.name.trim() || "Your account";

  return (
    <FormScreen
      overlay={
        <LoadingOverlay
          visible={saving || photoBusy}
          label={photoBusy ? "Saving your picture…" : "Saving your details…"}
        />
      }
    >
      <View className="gg-page gap-8 pb-16 pt-4">
        {/*
          The record this screen is about, before the fields that change it. A
          client arriving from the identity card should see the same thing they
          tapped, so the two read as one place rather than a card and an
          unrelated form. This block is drawn from Clerk and the session alone
          and has no loading state of its own — that is the whole fix.
        */}
        <View className="items-center gap-3">
          <Pressable
            onPress={() => void changePhoto()}
            disabled={!clerkUser || photoBusy}
            accessibilityRole="button"
            accessibilityLabel={identity.hasPhoto ? "Change your picture" : "Add a picture"}
            accessibilityHint="Opens your photo library"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <ClientMonogram name={headline} size={88} imageUrl={identity.imageUrl} />
          </Pressable>

          <View className="items-center gap-1">
            <Text
              className="text-center text-h3 text-text-primary"
              numberOfLines={2}
              accessibilityRole="header"
            >
              {headline}
            </Text>
            <View className="gg-chip border-outline">
              <Text className="text-caption text-text-secondary">
                {accountTypeOption(accountType).label} client
              </Text>
            </View>
          </View>

          {/* Fixed width so the control does not resize under the thumb when
              its label changes to "Saving…" and back. Monochrome: the one
              yellow on this screen belongs to Save. */}
          <View className="w-44">
            <SecondaryButton
              label={
                photoBusy ? "Saving…" : identity.hasPhoto ? "Change photo" : "Add a photo"
              }
              disabled={!clerkUser || photoBusy}
              onPress={() => void changePhoto()}
            />
          </View>
        </View>

        {photoProblem ? (
          <ErrorState label="Picture not saved" body={photoProblem} />
        ) : null}

        {/*
          The sign-in. Rows, not fields: each one is a commitment with steps
          behind it — a photo library, a code sent to a new address, a password
          typed twice — and drawing any of them as an input would promise that
          typing in it does something.
        */}
        <View className="gap-3">
          <Text className="text-overline text-text-muted">HOW YOU SIGN IN</Text>
          <View className="gap-2">
            <IdentityRow
              label="Email"
              value={identity.email || "—"}
              hint="Change the address you sign in with"
              onPress={() => router.push("/change-email")}
            />
            <IdentityRow
              label="Password"
              value="••••••••"
              hint="Set a new password for your GRIDGO sign-in"
              onPress={() => router.push("/change-password")}
            />
          </View>
        </View>

        {/*
          What GRIDGO holds. Fields with one Save, and only these need `/me`.
        */}
        <View className="gap-4">
          <Text className="text-overline text-text-muted">YOUR ACCOUNT</Text>

          {/*
            Only the GRIDGO half ever waits, and only when the session had
            nothing to seed a draft from. The person above is already drawn.
          */}
          {!draft && loading ? <DetailsSkeleton /> : null}

          {/*
            Nothing on screen yet gets the full invitation to act; a screen
            that has already loaded keeps its content and states the failure
            quietly, so a refresh that did not land never takes the details
            away.
          */}
          {loadProblem && !draft && !loading ? (
            <ErrorState
              label={
                loadProblem.kind === "not_open_yet"
                  ? "Not open yet"
                  : "Details unavailable"
              }
              body={loadProblem.message}
              retryLabel={loadProblem.kind === "not_open_yet" ? "Check again" : "Try again"}
              onRetry={() => void load(true, identity.name)}
            />
          ) : null}

          {/*
            The quiet line. These details are on screen and are what this phone
            last read, so a red card over the top of them would be louder than
            the news — but saying nothing would let a client believe they were
            looking at the latest.
          */}
          {loadProblem && draft ? (
            <QuietNotice
              message={loadProblem.message}
              actionLabel="Try again"
              onPress={() => void load(true, identity.name)}
            />
          ) : null}

          {account && draft ? (
            <>
              <View className="gap-6">
                {showsOrgName ? (
                  <FormField
                    label="Organisation name"
                    helper="What goes on the job with every supplier who prints for you."
                    error={fieldError("orgName")}
                  >
                    <TextField
                      value={draft.orgName}
                      onChangeText={(orgName) => edit({ orgName })}
                      placeholder="Bautista Trading"
                      accessibilityLabel="Organisation name"
                      autoCapitalize="words"
                      editable={!saving}
                    />
                  </FormField>
                ) : null}

                <FormField
                  label="Your name"
                  helper="Who GRIDGO asks for when a job needs a decision. This is the name on your sign-in too."
                  error={fieldError("name")}
                >
                  <TextField
                    value={draft.name}
                    onChangeText={(name) => edit({ name })}
                    placeholder="Ana Bautista"
                    accessibilityLabel="Your name"
                    autoCapitalize="words"
                    textContentType="name"
                    editable={!saving}
                  />
                </FormField>

                <FormField
                  label="Mobile number"
                  helper="The rider delivering your job gets this number."
                  error={fieldError("phone")}
                >
                  <TextField
                    value={draft.phone}
                    onChangeText={(phone) => edit({ phone })}
                    placeholder="0917 123 4567"
                    accessibilityLabel="Mobile number"
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!saving}
                  />
                </FormField>
              </View>

              {saveNotice ? (
                <ErrorState
                  label={
                    saveNotice.label ??
                    (saveNotice.reloadable ? "Not the latest" : "Not saved")
                  }
                  body={saveNotice.message}
                  retryLabel="Load the latest"
                  onRetry={
                    saveNotice.reloadable ? () => void load(true, identity.name) : undefined
                  }
                />
              ) : null}

              {changed ? (
                <PrimaryButton
                  label={saving ? "Saving…" : "Save changes"}
                  disabled={saving}
                  onPress={() => void save()}
                />
              ) : (
                // Nothing to save is not worth a dead yellow button.
                <Text className="text-caption text-text-muted">
                  These are the details GRIDGO has for your account. Change one to save it.
                </Text>
              )}
            </>
          ) : null}
        </View>
      </View>
    </FormScreen>
  );
}

/**
 * One thing Clerk owns: what it is now, and the way to change it.
 *
 * The value is on the row because that is the question a client actually came
 * to answer — "which address is this?" — and a row that only said "Email"
 * would send them into a screen to find out.
 */
function IdentityRow({
  label,
  value,
  hint,
  onPress,
}: {
  label: string;
  value: string;
  hint: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityHint={hint}
      className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-caption text-text-muted">{label}</Text>
        <Text className="text-body-lg text-text-primary" numberOfLines={1}>
          {value}
        </Text>
      </View>
      <ChevronRight
        size={20}
        color={colors.textMuted}
        aria-hidden
      />
    </Pressable>
  );
}

/**
 * News that does not deserve a card.
 *
 * `ErrorState` is a bordered panel with a red status chip, which is right when
 * a screen has nothing to show. Here the details are on screen and correct;
 * what is being reported is that they might not be the newest. So it is a
 * line, and the way to fix it is a link rather than a button — the brand
 * colour, which is what small links are for, and never the action yellow that
 * belongs to Save.
 */
function QuietNotice({
  message,
  actionLabel,
  onPress,
}: {
  message: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View className="flex-row flex-wrap items-baseline gap-x-2 gap-y-1">
      <Text className="min-w-0 flex-1 text-caption text-text-muted">{message}</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        hitSlop={12}
      >
        <Text className="text-caption font-medium text-brand">{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Placeholders in the shape of the form, so the page does not grow under the
 * thumb when the real fields land. Only the GRIDGO half is ever replaced by
 * these — the person above them is already on screen.
 */
function DetailsSkeleton() {
  return (
    <View
      className="gap-6"
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your account"
    >
      {[0, 1, 2].map((row) => (
        <View key={row} className="gap-2">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-4 w-3/4" />
        </View>
      ))}
    </View>
  );
}
