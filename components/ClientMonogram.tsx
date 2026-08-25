import { Image, Text, View } from "react-native";

import { GridgoMark } from "@/components/GridgoLogo";
import { accountInitials } from "@/lib/accountProfile";

type Props = {
  /** The name the account is known by — a business name, or a person's. */
  name: string;
  /** The tile's edge. 56 on the identity card, larger on a details screen. */
  size?: number;
  /**
   * The photo on the client's sign-in, from Clerk. Null falls back to the
   * initials, which is still the ordinary case — a picture is offered, never
   * asked for.
   */
  imageUrl?: string | null;
};

/**
 * The account, as a mark.
 *
 * A square tile, not the round frame the Supplier app puts a shop in. That
 * frame means premises and people — a shopfront, a rack of finished work — and
 * a client account is neither, so borrowing it would promise something this
 * app does not deal in. The square echoes the GRIDGO mark's own grid and reads
 * as what it is: a record with a name on it.
 *
 * A photo may now sit inside that square, because it is the picture on the
 * client's Clerk sign-in and they can already see it wherever else they use
 * that account. It is deliberately kept in the *square*: cropping it round
 * would make a client account look like a supplier's shopfront in the one app
 * where the two must never be confused. Nothing is required — where there is a
 * photo it is drawn, where there is only a name the initials stand, and where
 * a session read has not landed the GRIDGO mark stands rather than an empty
 * box or a guessed letter.
 */
export function ClientMonogram({ name, size = 56, imageUrl }: Props) {
  const initials = accountInitials(name);

  return (
    <View
      className="items-center justify-center overflow-hidden rounded-card border border-outline bg-surface-variant"
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: size, height: size }}
          resizeMode="cover"
        />
      ) : initials ? (
        <Text
          className="font-medium text-text-primary"
          // Scales with the tile: the type scale's steps are for running text,
          // and a monogram is a piece of geometry inside a known square.
          style={{ fontSize: Math.round(size * 0.36), lineHeight: Math.round(size * 0.44) }}
        >
          {initials}
        </Text>
      ) : (
        <GridgoMark size={Math.round(size * 0.5)} />
      )}
    </View>
  );
}
