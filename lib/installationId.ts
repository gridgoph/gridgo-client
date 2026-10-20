/**
 * This app installation's Founding Tester ID (gridgo-api
 * `docs/FOUNDING_TESTER_API.md`): a random UUID v4, made once and kept.
 *
 * It belongs to the installation, not to a person. Signing out, signing in as
 * someone else and every launch read back the same value, which is the whole
 * point: GRIDGO compares it between an inviter and the friend they invited.
 * Nothing in the app removes it — sign-out clears the session, never this key.
 *
 * It is a random number this app made, never a push token, a serial or an
 * advertising ID. GRIDGO never shows it back to the client or to staff.
 *
 * Kept apart from `lib/legalContext.ts`'s installation ID on purpose: that one
 * is `client-<random>`, which the tester routes refuse as not a UUID v4.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

export const INSTALLATION_ID_KEY = "gridgo.client.testerInstallationId.v1";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

/** A UUID v4 from the platform's random source, else one built to the same shape. */
export function newUuidV4(): string {
  try {
    const made = Crypto.randomUUID();
    if (isUuidV4(made)) return made.toLowerCase();
  } catch {
    // The native module is missing (a test, an odd runtime): fall through.
  }
  const fromGlobal = globalThis.crypto?.randomUUID?.();
  if (isUuidV4(fromGlobal)) return fromGlobal.toLowerCase();
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = "4";
  hex[16] = "89ab"[Math.floor(Math.random() * 4)];
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

let cached: string | null = null;
let pending: Promise<string | null> | null = null;

/**
 * The installation ID, made on first use. Null only when the phone cannot
 * store it: an ID that would change on the next launch is worse than none,
 * and the routes accept a call without one.
 */
export function installationId(): Promise<string | null> {
  if (cached) return Promise.resolve(cached);
  pending ??= (async () => {
    try {
      const stored = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
      if (isUuidV4(stored)) {
        cached = stored;
        return stored;
      }
      const made = newUuidV4();
      await AsyncStorage.setItem(INSTALLATION_ID_KEY, made);
      cached = made;
      return made;
    } catch {
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Tests only: forget the in-memory copy, as a cold start would. */
export function resetInstallationIdCacheForTests() {
  cached = null;
  pending = null;
}
