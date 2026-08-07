import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Redirect } from "expo-router";

import { GridgoLogo } from "@/components/GridgoLogo";
import { StatusChip } from "@/components/StatusChip";
import { getApiBase, health } from "@/lib/api";
import { useSession } from "@/store/session";

export default function LoginScreen() {
  const { user, login, loading, error } = useSession();
  const [email, setEmail] = useState("client@gridgo.local");
  const [password, setPassword] = useState("demo");
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

  return (
    <View className="flex-1 justify-center bg-canvas px-6">
      <GridgoLogo />
      <Text className="mt-6 font-satoshi-bold text-2xl text-text-primary">Client sign in</Text>
      <Text className="mt-1 font-satoshi text-text-secondary">GRIDGO managed printing · Davao</Text>
      <TextInput
        className="mt-6 rounded-xl border border-outline bg-surface px-4 py-3 font-satoshi text-text-primary"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="mt-3 rounded-xl border border-outline bg-surface px-4 py-3 font-satoshi text-text-primary"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text className="mt-3 font-satoshi text-error">{error}</Text> : null}
      <Pressable
        className="mt-5 items-center rounded-xl bg-action-yellow py-3.5"
        disabled={loading}
        onPress={() => void login(email.trim(), password)}
      >
        <Text className="font-satoshi-medium text-action-yellow-on">{loading ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
      <Text className="mt-4 font-satoshi text-sm text-text-muted">client@gridgo.local / demo</Text>

      <View className="absolute bottom-8 left-6 right-6 flex-row items-center justify-center gap-2">
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
  );
}
