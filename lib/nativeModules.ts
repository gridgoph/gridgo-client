/**
 * Native modules that a USB development APK may not have been rebuilt with.
 *
 * Requiring the JS package still throws `Cannot find native module '…'` at
 * import time when the binary is older than the JS, and LogBox reports that
 * throw as uncaught even from a try/catch. Probe first; load the package only
 * when the native module is actually on the phone.
 *
 * Jest has no native binary, so the probe is skipped there and the usual
 * `jest.mock` of the JS package is used.
 */

type DocumentPickerNative = typeof import("expo-document-picker");
type DateTimePickerNative = typeof import("@react-native-community/datetimepicker");

let documentPickerNative: DocumentPickerNative | null | undefined;
let dateTimePickerNative: DateTimePickerNative | null | undefined;

export const FILE_PICKER_NEEDS_REBUILD =
  "Choosing a file needs a rebuilt GRIDGO app on this phone. Everything else on this screen still works.";

export const DEADLINE_PICKER_NEEDS_REBUILD =
  "Setting a deadline needs a rebuilt GRIDGO app on this phone. Everything else on this screen still works.";

function optionalNative(name: string): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require("expo-modules-core") as {
      requireOptionalNativeModule: (moduleName: string) => unknown;
    };
    return requireOptionalNativeModule(name);
  } catch {
    return null;
  }
}

function nativeModulePresent(name: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules, TurboModuleRegistry } = require("react-native") as {
      NativeModules?: Record<string, unknown>;
      TurboModuleRegistry?: { get?: (moduleName: string) => unknown };
    };
    if (TurboModuleRegistry?.get?.(name)) return true;
    if (NativeModules?.[name]) return true;
  } catch {
    // Fall through to the Expo probe.
  }
  return Boolean(optionalNative(name));
}

function inJest(): boolean {
  return typeof process !== "undefined" && Boolean(process.env.JEST_WORKER_ID);
}

export function getDocumentPickerNative(): DocumentPickerNative | null {
  if (documentPickerNative !== undefined) return documentPickerNative;
  if (!inJest() && !optionalNative("ExpoDocumentPicker")) {
    documentPickerNative = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    documentPickerNative = require("expo-document-picker") as DocumentPickerNative;
    return documentPickerNative;
  } catch {
    documentPickerNative = null;
    return null;
  }
}

export function getDateTimePickerNative(): DateTimePickerNative | null {
  if (dateTimePickerNative !== undefined) return dateTimePickerNative;
  if (!inJest() && !nativeModulePresent("RNCDatePicker")) {
    dateTimePickerNative = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require("@react-native-community/datetimepicker") as DateTimePickerNative & {
      default?: DateTimePickerNative["default"];
    };
    dateTimePickerNative = {
      ...loaded,
      default: loaded.default ?? (loaded as unknown as DateTimePickerNative["default"]),
      DateTimePickerAndroid: loaded.DateTimePickerAndroid,
    };
    return dateTimePickerNative;
  } catch {
    dateTimePickerNative = null;
    return null;
  }
}
