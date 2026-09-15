import { Header, getHeaderTitle } from "expo-router/react-navigation";
import type { ComponentProps } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Owns the Android header's top safe area under edge-to-edge.
 *
 * Use the React Navigation Header in place of the native toolbar so the status
 * inset is applied once, through headerStatusBarHeight. The fill extends behind
 * the system icons; the title row begins below them. Do not add top padding to
 * this wrapper. components/__tests__/PushedStackHeader.test.tsx pins the inset
 * passed to Header; route selection belongs to lib/navigationHeaders.ts.
 */
export function PushedStackHeader({
  options,
  route,
  back,
}: {
  options: { title?: string };
  route: { name: string };
  back?: { title: string | undefined; href: string | undefined };
}) {
  const insets = useSafeAreaInsets();

  return (
    <Header
      {...(options as ComponentProps<typeof Header>)}
      title={getHeaderTitle(options, route.name)}
      back={back}
      headerStatusBarHeight={insets.top}
    />
  );
}
