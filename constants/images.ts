import gcashQr from "@/assets/payment/gcash-qr.jpg";

/**
 * Every image the app draws, imported once.
 *
 * `gcashQr` is GRIDGO's bundled receiving QR — the InstaPay plate a client
 * scans to send the 75%. Checkout prefers `paymentQr.imageUrl` from settings
 * when Operations has uploaded a replacement; this JPEG is the fallback so
 * the sheet is never a blank plate.
 */
export const images = {
  gcashQr,
};
