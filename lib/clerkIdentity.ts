import type { User } from "@/lib/api";
import { clerkErrorCode, clerkErrorMessage, splitFullName } from "@/lib/clerkAuth";
import { checkSignupField, EMPTY_SIGNUP, MIN_PASSWORD_LENGTH } from "@/lib/signup";
import { canPickOnWeb, pickFileOnWeb } from "@/lib/webFilePick";

/**
 * The half of a client's account Clerk owns: the photo, the sign-in email, the
 * sign-in password, and the name behind them.
 *
 * GRIDGO owns the product profile — the number, the account type, the
 * organisation name — and that goes through `/me` in `lib/accountProfile.ts`.
 * This does not, and the boundary is not cosmetic. It is the difference
 * between what the app already knows and what it has to go and ask for:
 * `useUser()` has the person in memory the moment Clerk is loaded, while `/me`
 * is a round trip that can hang. **Your details** used to open on a skeleton
 * and wait for the second before drawing any of the first, so a client whose
 * `/me` never answered sat in front of grey bars with their own account
 * already on the phone. `clientIdentity` is the reader that stops that: it is
 * pure, it is synchronous, and it never consults the network.
 *
 * The name is the one detail both hold. Clerk's is what a person signs in as;
 * GRIDGO's is what a supplier reads on the job. They are meant to be the same
 * string, so a correction writes both — `clerkName` for the sign-in and
 * `PATCH /me` for the record — and a read prefers Clerk's, because that is the
 * copy the client just changed.
 *
 * The email change has three endings, and telling them apart is the whole job:
 *
 * - **Clerk refuses the address.** Somebody already signs in with it. There is
 *   nothing to retry and nothing to take over, so the client is told plainly.
 * - **Clerk accepts it and GRIDGO keeps its own.** GRIDGO copies Clerk's
 *   primary email onto the account unless another client's record already
 *   holds that address. That is not a failure and it is not a success — the
 *   sign-in moved and the GRIDGO email did not — so it is said out loud and
 *   sent to Operations rather than retried.
 * - **Both take it.** The ordinary ending.
 */

/* --------------------------------------------------------------------------
   Who is signed in, without asking anyone
   -------------------------------------------------------------------------- */

/**
 * The slice of Clerk's user this app reads. Narrow on purpose: it is the whole
 * contract a test has to stand up, and it keeps the screens off everything
 * else Clerk's resource carries.
 */
export type ClerkIdentityUser = {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string;
  hasImage?: boolean;
  primaryEmailAddress?: { emailAddress: string } | null;
};

export type ClientIdentity = {
  /** What to call this person. Empty only when neither owner has a name yet. */
  name: string;
  /** The address that signs in. Empty when Clerk has not loaded. */
  email: string;
  /** A photo to draw, or null for the monogram. */
  imageUrl: string | null;
  /** True once there is a real photo, so a control can say Change, not Add. */
  hasPhoto: boolean;
};

/**
 * Clerk first, GRIDGO second, and never a wait.
 *
 * Both arguments are optional because both are genuinely absent at different
 * moments — Clerk before it has loaded, GRIDGO before `/me` has answered — and
 * the screen has to draw something honest in either gap. What it must never do
 * is treat "not here yet" as "not known", which is what blocking on `/me` did.
 */
export function clientIdentity(
  clerk: ClerkIdentityUser | null | undefined,
  gridgo: Pick<User, "name" | "email"> | null | undefined,
): ClientIdentity {
  const clerkName = clerk?.fullName?.trim() || joinName(clerk?.firstName, clerk?.lastName);
  const clerkEmail = clerk?.primaryEmailAddress?.emailAddress?.trim() ?? "";
  // A photo is Clerk's alone. `hasImage` is what tells a real portrait from
  // the initials avatar Clerk generates and still serves through `imageUrl`,
  // which would otherwise be drawn as if the client had uploaded it.
  const hasPhoto = Boolean(clerk?.hasImage && clerk?.imageUrl);

  return {
    name: clerkName || gridgo?.name?.trim() || "",
    email: clerkEmail || gridgo?.email?.trim() || "",
    imageUrl: hasPhoto ? (clerk?.imageUrl ?? null) : null,
    hasPhoto,
  };
}

function joinName(first?: string | null, last?: string | null): string {
  return [first?.trim(), last?.trim()].filter(Boolean).join(" ");
}

/* --------------------------------------------------------------------------
   The client's photo
   -------------------------------------------------------------------------- */

/** The narrow slice of Clerk's user the portrait needs. Keeps tests honest. */
export type ClerkPortraitUser = {
  setProfileImage: (params: { file: Blob | File | string | null }) => Promise<unknown>;
  reload?: () => Promise<unknown>;
};

export type PortraitOutcome =
  | { status: "ok" }
  /** The client closed the picker. Nothing happened and nothing is said. */
  | { status: "cancelled" }
  | { status: "failed"; message: string };

export const PORTRAIT_LIBRARY_REFUSED =
  "GRIDGO needs access to your photos to set a picture. Turn it on for this app in your phone's settings.";

/**
 * Last resort when this binary has neither the photo library nor the file
 * picker. Artwork and payment proof already ship the file picker, so a USB
 * development build that predates `expo-image-picker` can still set a picture.
 * Said plainly, because "could not save" would send them to retry a picker
 * that is not on the phone.
 */
export const PORTRAIT_NEEDS_REBUILD =
  "Changing your picture needs a rebuilt GRIDGO app on this phone. Your other details still work.";

const PORTRAIT_FAILED =
  "That picture could not be saved to your GRIDGO sign-in. Check this phone's connection and try again.";

type ImagePickerNative = typeof import("expo-image-picker");
type DocumentPickerNative = typeof import("expo-document-picker");

let imagePickerNative: ImagePickerNative | null | undefined;
let documentPickerNative: DocumentPickerNative | null | undefined;

/**
 * Whether a native Expo module is compiled into this binary.
 *
 * `require("expo-image-picker")` still throws `Cannot find native module
 * 'ExponentImagePicker'` when the JS package is present and the APK is not,
 * and LogBox reports that throw as uncaught even from a try/catch — which is
 * the red overlay on Change photo. Probe first; never load the JS package
 * unless the native module is actually there.
 */
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

/**
 * The cropped library picker, or null when this binary was built without it.
 *
 * Same shape as `getNotificationsNative`: Metro evaluates the require only
 * when someone taps Change photo, and only after the native module is present.
 */
export function getImagePickerNative(): ImagePickerNative | null {
  if (imagePickerNative !== undefined) return imagePickerNative;
  if (!optionalNative("ExponentImagePicker")) {
    imagePickerNative = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    imagePickerNative = require("expo-image-picker") as ImagePickerNative;
    return imagePickerNative;
  } catch {
    imagePickerNative = null;
    return null;
  }
}

function getDocumentPickerNative(): DocumentPickerNative | null {
  if (documentPickerNative !== undefined) return documentPickerNative;
  if (!optionalNative("ExpoDocumentPicker")) {
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

/**
 * What React Native can actually hand Clerk.
 *
 * Clerk sends a `file` that is a string as the raw request body under
 * `application/octet-stream`, so a `file://` path would be uploaded verbatim
 * and stored as the picture. The other branch builds a `FormData` and appends
 * the value, which is exactly what React Native's own `FormData` understands
 * as `{ uri, name, type }`. So the descriptor is the shape that works, and the
 * cast at the call site is the price of a type written for a browser's `File`.
 */
export type PortraitFile = { uri: string; name: string; type: string };

export function portraitFile(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): PortraitFile {
  const type = asset.mimeType || "image/jpeg";
  // Clerk stores the name it is given; nobody should find "IMG_0421" is the
  // only thing naming their own account picture.
  const suffix = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return { uri: asset.uri, name: asset.fileName || `client-photo.${suffix}`, type };
}

type PickedPortrait =
  | {
      status: "ok";
      asset: {
        uri: string;
        fileName?: string | null;
        mimeType?: string | null;
        file?: File;
      };
    }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

/**
 * Prefer the cropped photo library. A USB binary built before
 * `expo-image-picker` still has the artwork file picker, which can choose an
 * image without a rebuild. On web the native probe is empty, so a file input
 * is what actually opens the dialog.
 */
async function pickPortraitAsset(): Promise<PickedPortrait> {
  if (canPickOnWeb()) {
    try {
      const picked = await pickFileOnWeb("image/*");
      if (!picked) return { status: "cancelled" };
      return {
        status: "ok",
        asset: {
          uri: picked.uri,
          fileName: picked.name,
          mimeType: picked.mimeType,
          file: picked.file,
        },
      };
    } catch {
      return { status: "failed", message: PORTRAIT_NEEDS_REBUILD };
    }
  }

  const ImagePicker = getImagePickerNative();
  if (ImagePicker) {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        // The tile is square, so anything else is cropped by the frame rather
        // than by the client, and someone who centred their face would not see
        // it.
        aspect: [1, 1],
        quality: 0.8,
      });
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset) return { status: "cancelled" };
      return { status: "ok", asset };
    } catch (error) {
      if (!isNativePickerMissing(error)) {
        return { status: "failed", message: PORTRAIT_LIBRARY_REFUSED };
      }
      // Fall through to the file picker already on this binary.
    }
  }

  const Documents = getDocumentPickerNative();
  if (!Documents) {
    return { status: "failed", message: PORTRAIT_NEEDS_REBUILD };
  }

  try {
    const picked = await Documents.getDocumentAsync({
      type: "image/*",
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return { status: "cancelled" };
    const asset = picked.assets[0];
    if (!asset) return { status: "cancelled" };
    return {
      status: "ok",
      asset: { uri: asset.uri, fileName: asset.name, mimeType: asset.mimeType },
    };
  } catch (error) {
    if (isNativePickerMissing(error)) {
      return { status: "failed", message: PORTRAIT_NEEDS_REBUILD };
    }
    return { status: "failed", message: PORTRAIT_LIBRARY_REFUSED };
  }
}

/**
 * Choose a picture and put it on the GRIDGO sign-in.
 *
 * The library, not the camera. This picture is a photo already taken or a logo
 * already made; opening a live camera on an account screen asks someone to
 * photograph themselves to finish a form, which is not what they came here to
 * do.
 */
export async function changeClientPhoto(
  user: ClerkPortraitUser,
): Promise<PortraitOutcome> {
  const picked = await pickPortraitAsset();
  if (picked.status !== "ok") return picked;

  try {
    const file = picked.asset.file ?? (portraitFile(picked.asset) as unknown as Blob);
    await user.setProfileImage({ file });
    // Clerk's own copy of the user is what every screen reads `imageUrl` from,
    // so it is re-read here rather than leaving the old picture on screen.
    await user.reload?.();
    return { status: "ok" };
  } catch (error) {
    return { status: "failed", message: clerkErrorMessage(error, PORTRAIT_FAILED) };
  }
}

function isNativePickerMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cannot find native module|ExponentImagePicker/i.test(message);
}

/* --------------------------------------------------------------------------
   The name behind the sign-in
   -------------------------------------------------------------------------- */

export type ClerkNameUser = {
  update: (params: { firstName?: string; lastName?: string }) => Promise<unknown>;
  reload?: () => Promise<unknown>;
};

export const CLERK_NAME_KEPT =
  "Your details are saved. GRIDGO could not update the name on your sign-in as well — try again in a moment, and it will catch up.";

/**
 * Put the corrected name on the sign-in too.
 *
 * Deliberately separate from the GRIDGO save and deliberately allowed to fail
 * on its own: GRIDGO's copy is the one a supplier prints against, so it is
 * written first and its refusal is what stops the save. Clerk falling over
 * afterwards leaves the two names apart for a moment, which is worth a
 * sentence and is not worth throwing away a correction that already landed.
 */
export async function syncClerkName(
  user: ClerkNameUser,
  fullName: string,
): Promise<{ status: "ok" } | { status: "failed" }> {
  const trimmed = fullName.trim();
  if (!trimmed) return { status: "ok" };

  try {
    // Clerk stores a first and a last name, so one typed string is split the
    // same way sign-up splits it. Anything past the first word is the surname.
    await user.update(splitFullName(trimmed));
    await user.reload?.();
    return { status: "ok" };
  } catch {
    return { status: "failed" };
  }
}

/* --------------------------------------------------------------------------
   The sign-in email
   -------------------------------------------------------------------------- */

/** Clerk's email-address resource, down to what this flow uses. */
export type ClerkEmailAddress = {
  id: string;
  emailAddress: string;
  prepareVerification: (params: { strategy: "email_code" }) => Promise<unknown>;
  attemptVerification: (params: { code: string }) => Promise<unknown>;
};

export type ClerkEmailUser = {
  createEmailAddress: (params: { email: string }) => Promise<ClerkEmailAddress>;
  update: (params: { primaryEmailAddressId: string }) => Promise<unknown>;
  reload?: () => Promise<unknown>;
};

export const EMAIL_ALREADY_REGISTERED =
  "That email already has a GRIDGO sign-in. Use a different address, or sign in with the account that owns it.";

export const EMAIL_UNCHANGED = "That is already the email on this account.";

const EMAIL_SEND_FAILED =
  "GRIDGO could not send a code to that address. Check this phone's connection and try again.";

const EMAIL_CONFIRM_FAILED =
  "That code was not accepted. Check the six digits in the email, or send another code.";

const EMAIL_PRIMARY_FAILED =
  "Your new address is verified, but GRIDGO could not make it the one you sign in with. Try again in a moment.";

/**
 * GRIDGO kept its own address because another client already has it.
 *
 * Named rather than implied. The sign-in genuinely moved, so telling the client
 * "nothing happened" would be false, and telling them "your email changed"
 * would be false the next time they read this screen.
 */
export function emailKeptByGridgo(clerkEmail: string, gridgoEmail: string): string {
  return `You now sign in with ${clerkEmail}. GRIDGO already has an account on that address, so this account's GRIDGO email is still ${gridgoEmail}. Ask Operations to sort out which account it belongs to.`;
}

/** What is wrong with the address as typed, before a round trip is spent. */
export function newEmailProblem(value: string, current: string): string | null {
  const trimmed = value.trim();
  // Sign-up's own wording, imported rather than rewritten: a client told one
  // thing while opening the account and another while correcting the same
  // detail learns that neither sentence means anything.
  const check = checkSignupField("email", { ...EMPTY_SIGNUP, email: trimmed });
  if (!check.ok) return check.reason;
  if (trimmed.toLowerCase() === current.trim().toLowerCase()) return EMAIL_UNCHANGED;
  return null;
}

export type EmailStepOutcome<T> =
  | { status: "ok"; value: T }
  /** Somebody already signs in with it. Not a retry and not a takeover. */
  | { status: "already_registered" }
  | { status: "failed"; message: string };

/**
 * Add the address to the sign-in and send it a code.
 *
 * Nothing is primary yet. An address Clerk holds but has not verified cannot
 * sign anyone in, so a client who abandons this halfway is exactly where they
 * started.
 */
export async function startEmailChange(
  user: ClerkEmailUser,
  address: string,
): Promise<EmailStepOutcome<ClerkEmailAddress>> {
  let created: ClerkEmailAddress;
  try {
    created = await user.createEmailAddress({ email: address.trim() });
  } catch (error) {
    if (isAlreadyRegistered(error)) return { status: "already_registered" };
    return { status: "failed", message: clerkErrorMessage(error, EMAIL_SEND_FAILED) };
  }

  try {
    await created.prepareVerification({ strategy: "email_code" });
  } catch (error) {
    return { status: "failed", message: clerkErrorMessage(error, EMAIL_SEND_FAILED) };
  }
  return { status: "ok", value: created };
}

/** Send the code again to an address that is already waiting on one. */
export async function resendEmailCode(
  address: ClerkEmailAddress,
): Promise<EmailStepOutcome<null>> {
  try {
    await address.prepareVerification({ strategy: "email_code" });
    return { status: "ok", value: null };
  } catch (error) {
    return { status: "failed", message: clerkErrorMessage(error, EMAIL_SEND_FAILED) };
  }
}

/**
 * Confirm the code, then make the address the one that signs in.
 *
 * Both halves belong together: an address verified but never made primary is a
 * client who answered their email and still signs in with the old one, with
 * nothing on screen saying so.
 */
export async function confirmEmailChange(
  user: ClerkEmailUser,
  address: ClerkEmailAddress,
  code: string,
): Promise<EmailStepOutcome<string>> {
  try {
    await address.attemptVerification({ code: code.trim() });
  } catch (error) {
    return { status: "failed", message: clerkErrorMessage(error, EMAIL_CONFIRM_FAILED) };
  }

  try {
    await user.update({ primaryEmailAddressId: address.id });
    await user.reload?.();
  } catch (error) {
    if (isAlreadyRegistered(error)) return { status: "already_registered" };
    return { status: "failed", message: clerkErrorMessage(error, EMAIL_PRIMARY_FAILED) };
  }
  return { status: "ok", value: address.emailAddress };
}

/**
 * Clerk saying the address belongs to somebody else.
 *
 * The code is the reliable half; the sentence is checked as well because a
 * refusal that arrives without one still has to reach the client as the right
 * refusal rather than as a connection problem.
 */
function isAlreadyRegistered(error: unknown): boolean {
  const code = clerkErrorCode(error);
  if (code === "form_identifier_exists" || code === "identifier_already_signed_in") {
    return true;
  }
  return /already .*(taken|in use|exists)|is taken/i.test(clerkErrorMessage(error, ""));
}

/* --------------------------------------------------------------------------
   The sign-in password
   -------------------------------------------------------------------------- */

/**
 * Verified against the installed package rather than assumed:
 * `node_modules/@clerk/expo/node_modules/@clerk/shared/dist/types/user.d.ts`
 * declares `updatePassword(params: UpdateUserPasswordParams)` on
 * `UserResource`, with `newPassword`, an optional `currentPassword` and an
 * optional `signOutOfOtherSessions`. So this is the user-resource change, not
 * the signed-out `signIn` recovery flow — the client is already signed in, and
 * mailing them a reset code to change a password they know would be a longer
 * road to the same place.
 */
export type ClerkPasswordUser = {
  updatePassword: (params: {
    newPassword: string;
    currentPassword?: string;
    signOutOfOtherSessions?: boolean;
  }) => Promise<unknown>;
  /** False for an account that only ever signed in with Google. */
  passwordEnabled?: boolean;
};

export type PasswordField = "current" | "next" | "confirm";

export type PasswordDraft = {
  current: string;
  next: string;
  confirm: string;
};

export const EMPTY_PASSWORD_DRAFT: PasswordDraft = { current: "", next: "", confirm: "" };

export const PASSWORD_WRONG_CURRENT =
  "That is not your current password. Type the one you sign in with now, or sign out and use “Forgot password”.";

export const PASSWORD_NO_PASSWORD_SET =
  "This account signs in with Google, so it has no password to change. Signing in with Google is all it needs.";

const PASSWORD_FAILED =
  "GRIDGO could not change your password. Check this phone's connection and try again.";

export const PASSWORD_CHANGED =
  "Your password is changed. Anywhere else you were signed in has been signed out.";

/** What still stops the change, per field. Nothing here costs a round trip. */
export function passwordProblems(draft: PasswordDraft): Partial<Record<PasswordField, string>> {
  const problems: Partial<Record<PasswordField, string>> = {};

  if (!draft.current) {
    problems.current = "Enter the password you sign in with now.";
  }

  // Sign-up's own bar and sign-up's own sentence, so the rule a client met
  // when they opened the account is the rule they meet again here.
  const next = checkSignupField("password", { ...EMPTY_SIGNUP, password: draft.next });
  if (!next.ok && next.reason) {
    problems.next = next.reason;
  } else if (draft.next && draft.next === draft.current) {
    problems.next = "This is the password you already have. Choose a different one.";
  }

  if (draft.confirm !== draft.next) {
    problems.confirm = "These do not match. Type the new password again.";
  }
  return problems;
}

export function passwordReady(draft: PasswordDraft): boolean {
  return Object.keys(passwordProblems(draft)).length === 0;
}

export type PasswordOutcome =
  | { status: "ok" }
  /** Clerk would not take the current password. Points at that field. */
  | { status: "wrong_current" }
  | { status: "failed"; message: string };

/**
 * Change the password on the sign-in.
 *
 * `signOutOfOtherSessions` is on and is not offered as a choice. Somebody
 * changing a password on a phone is either tidying up or locking somebody out,
 * and the second reason is the one that matters — a checkbox that lets the
 * other session survive is a checkbox that will be missed by whoever most
 * needed it. The screen says plainly that this is what happens.
 */
export async function changeSignInPassword(
  user: ClerkPasswordUser,
  draft: PasswordDraft,
): Promise<PasswordOutcome> {
  try {
    await user.updatePassword({
      currentPassword: draft.current,
      newPassword: draft.next,
      signOutOfOtherSessions: true,
    });
    return { status: "ok" };
  } catch (error) {
    if (isWrongPassword(error)) return { status: "wrong_current" };
    return { status: "failed", message: clerkErrorMessage(error, PASSWORD_FAILED) };
  }
}

/**
 * Clerk refusing the current password, rather than the new one.
 *
 * Worth telling apart because the two land on different fields: a client
 * pointed at the new password when the old one was the typo retypes the wrong
 * thing until they give up.
 */
function isWrongPassword(error: unknown): boolean {
  const code = clerkErrorCode(error);
  if (code === "form_password_incorrect" || code === "form_password_validation_failed") {
    return true;
  }
  return /current password|incorrect password|password is incorrect/i.test(
    clerkErrorMessage(error, ""),
  );
}

/** Restated where the screen needs it, so the rule is written in one place. */
export { MIN_PASSWORD_LENGTH };
