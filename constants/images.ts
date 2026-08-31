import type { ImageSourcePropType } from "react-native";

import gcashQr from "@/assets/payment/gcash-qr.jpg";
import type { OnboardingArt } from "@/data/onboarding";

/**
 * Raster images, required in one place.
 *
 * Screens and components take `images.*` from here — they do not `require`
 * an asset themselves. Metro wants a static `require` of a string literal,
 * so each file is named here, not discovered.
 *
 * `gcashQr` is GRIDGO's bundled receiving QR — the InstaPay plate a client
 * scans to send the 75%. Checkout prefers `paymentQr.imageUrl` from settings
 * when Operations has uploaded a replacement; this JPEG is the fallback so
 * the sheet is never a blank plate.
 */
export const images = {
  gcashQr,
  onboarding: {
    order: require("../assets/images/onboarding/first-onboarding.png"),
    approve: require("../assets/images/onboarding/second-onboarding.png"),
    track: require("../assets/images/onboarding/third-onboarding.png"),
  } satisfies Record<OnboardingArt, number>,
};

export function onboardingImage(name: OnboardingArt): ImageSourcePropType {
  return images.onboarding[name];
}
