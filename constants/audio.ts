/**
 * Audio, required in one place.
 *
 * The same rule `constants/images.ts` follows: an asset is named here once and
 * reached by name everywhere else, because Metro wants a static `require` of a
 * string literal and a file discovered at runtime is a file that is not in the
 * bundle.
 *
 * Both stings come from the legacy GRIDGO app, where this opening was designed
 * — `printing_app/apps/mobile/assets/audio`. `intro` rides the dots as they
 * light; `outro` lands with the wordmark.
 *
 * `update` is the in-app chime for a new order update (#230): two soft notes,
 * a fifth apart and rising, 0.6 s, made for GRIDGO rather than borrowed from a
 * platform tone, so it never sounds like a call or a text.
 *
 * `print` is the receipt coming out of its slot after checkout (#229): a
 * thermal printer's feed and the tear, 1.1 s, timed to the slip's feed in
 * `lib/receiptPrint.ts`. Made for GRIDGO, like the chime.
 *
 * `Record<string, number>` for the same reason `constants/fonts.ts` uses it:
 * Metro returns a module id for a required asset, and that is what
 * `expo-audio` takes as a source.
 */
export const audio: Record<"intro" | "outro" | "update" | "print", number> = {
  intro: require("../assets/audio/intro.m4a"),
  outro: require("../assets/audio/outro.m4a"),
  update: require("../assets/audio/update.m4a"),
  print: require("../assets/audio/print.m4a"),
};
