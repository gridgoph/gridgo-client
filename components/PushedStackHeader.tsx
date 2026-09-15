import { Header, getHeaderTitle } from "expo-router/react-navigation";
import type { ComponentProps } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Android native-stack header under edge-to-edge.
 *
 * The Material AppBarLayout and the toolbar each apply the status inset, so
 * the title sits in a 56dp row under an empty band the height of the clock.
 * This is the same Header the JS stack uses, with one `headerStatusBarHeight`
 * — the header fill goes behind the system icons, and the title row sits
 * immediately under them. iOS keeps the native header; this is Android-only
 * via `pushedScreenOptions`.
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
