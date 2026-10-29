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
 * `receipt` lands as the receipt starts printing out of its slot after
 * checkout (#229): one soft ping, 0.35 s, peaking at -12 dBFS, and played
 * quieter still (`RECEIPT_SOUND_VOLUME`). It replaced a 1.1 s thermal-printer
 * feed that testers found too loud (#339); the slip's feed is still the print.
 * Synthesized for GRIDGO with ffmpeg — a 1318.5 Hz sine (E6) with a quieter
 * octave that fades first, a 4 ms attack and a 70 ms decay:
 * `aevalsrc=0.3*min(t/0.004\,1)*(exp(-t/0.07)*sin(2*PI*1318.5*t)+0.25*exp(-t/0.035)*sin(2*PI*2637*t))/1.25:s=44100:d=0.35:c=mono`,
 * AAC 64 kb/s.
 *
 * `Record<string, number>` for the same reason `constants/fonts.ts` uses it:
 * Metro returns a module id for a required asset, and that is what
 * `expo-audio` takes as a source.
 */
export const audio: Record<"intro" | "outro" | "update" | "receipt", number> = {
  intro: require("../assets/audio/intro.m4a"),
  outro: require("../assets/audio/outro.m4a"),
  update: require("../assets/audio/update.m4a"),
  receipt: require("../assets/audio/receipt.m4a"),
};
