import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Redirect, useRouter } from "expo-router";

import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { getApiBase, health } from "@/lib/api";
import { useSession } from "@/store/session";

/**
 * The first screen a customer meets, so it is held to the same bar as the rest.
 *
 * It used to be written in raw utility classes — `text-2xl`, `font-satoshi`,
 * `rounded-xl`, `py-3` — none of which exist here: `global.css` resets the
 * default type, weight and radius scales on purpose so only GRIDGO tokens
 * survive. Every one of those classes was silently a no-op, which is why the
 * heading rendered in the system font at a size the type scale does not have,
 * and why the fields and the button were never guaranteed a 44dp touch target.
 * It is built from the same primitives as every other form in the app now.
 */
export default function LoginScreen() {
  const { user, login, loading, error } = useSession();
  const router = useRouter();
  /*
    Empty, both of them.

    These fields used to open pre-filled with a demo account and its password.
    That is a convenience on a laptop and a way in on a hosted pilot: the app is
    served over a public domain, so anyone who opens it is handed working
    credentials before they have typed anything. It is wrong even against the
    accounts it named — the pilot's demo passwords come from deployment
    configuration now, so a password written into this repository is a
    published secret that no longer opens anything, which is the worst of both.
    What actually helps someone sign in is below: what this app is for, which
    roles belong elsewhere, and whether the API is reachable.
  */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiBase] = useState(() => getApiBase());
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await health();
        if (!cancelled) setReachable(result.ok === true);
      } catch {
        if (!cancelled) setReachable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (user) return <Redirect href="/(tabs)/home" />;

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  return (
    /*
      No header sits above this screen, so it owns both edges itself. The
      content is centred until it outgrows the screen, and then scrolls.
    */
    <FormScreen
      edges={["top", "bottom"]}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
    >
      <View className="gg-page py-10">
        {/*
          Plain GRIDGO while signed out. Account type is unknown until login
          resolves, and the product is one client binary — flashing Business
          after sign-in on this screen would fight identity stability. Business
          lockup appears on signed-in identity surfaces (home header) only.
        */}
        <GridgoLogo />

        <Text className="mt-8 text-h1 text-text-primary" accessibilityRole="header">
          Sign in
        </Text>
        <Text className="mt-2 text-body-lg text-text-secondary">
          The client side of GRIDGO — request a print job, approve the proof, and follow
          it to your door in Davao.
        </Text>

        <View className="mt-8 gap-4">
          <FormField label="Email">
            <TextField
              value={email}
              onChangeText={setEmail}
              placeholder="you@company.com"
              accessibilityLabel="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="username"
              returnKeyType="next"
            />
          </FormField>

          <FormField label="Password">
            <TextField
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              accessibilityLabel="Password"
              autoCapitalize="none"
              secureTextEntry
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => {
                if (canSubmit) void login(email.trim(), password);
              }}
            />
          </FormField>
        </View>

        {error ? (
          <View className="mt-4">
            <ErrorState label="Could not sign in" body={error} />
          </View>
        ) : null}

        <View className="mt-6 gap-3">
          <PrimaryButton
            label={loading ? "Signing in…" : "Sign in"}
            disabled={!canSubmit}
            onPress={() => void login(email.trim(), password)}
          />
          {/* Secondary, and monochrome: the screen's one yellow control is
              the sign-in button, and a first-time client reads down to this
              without it needing to shout. */}
          <SecondaryButton
            label="Create an account"
            disabled={loading}
            onPress={() => router.push("/(auth)/signup")}
          />
        </View>

        <Text className="mt-6 text-caption text-text-muted">
          GRIDGO ships one app per role. If this account is a supplier, a rider or
          Operations, sign in on that app instead.
        </Text>

        {/* Build diagnostics, kept quiet and kept last. */}
        <View className="mt-8 flex-row items-center gap-2">
          <Text className="shrink text-caption text-text-muted" numberOfLines={1}>
            {apiBase}
          </Text>
          {reachable === null ? (
            <Text className="text-caption text-text-muted">Checking…</Text>
          ) : (
            <StatusChip
              tone={reachable ? "success" : "error"}
              label={reachable ? "Reachable" : "Unreachable"}
              icon={reachable ? "circle-check" : "circle-x"}
            />
          )}
        </View>
      </View>
    </FormScreen>
  );
}
