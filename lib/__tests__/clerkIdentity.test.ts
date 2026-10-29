import { File as DeviceFile } from "expo-file-system";
import { TextEncoder } from "util";

import {
  changeClientPhoto,
  changeSignInPassword,
  clerkName,
  clientIdentity,
  confirmEmailChange,
  EMAIL_UNCHANGED,
  newEmailProblem,
  passwordProblems,
  passwordReady,
  portraitFile,
  PORTRAIT_FAILED,
  PORTRAIT_GONE,
  saveClientPhoto,
  startEmailChange,
  syncClerkName,
  type ClerkEmailAddress,
} from "@/lib/clerkIdentity";

// jest-expo's own `expo-modules-core` mock answers the native probes: the
// image picker is there, and `FileSystem` is an in-memory file system behind
// the real `File` class.
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ImagePicker = require("expo-image-picker") as {
  launchImageLibraryAsync: jest.Mock;
};

/** Clerk's refusals are structured; this is the shape the SDK throws. */
function clerkError(code: string, message = "refused"): unknown {
  return { errors: [{ code, message, longMessage: message }] };
}

describe("clientIdentity", () => {
  const gridgo = { name: "Mark D", email: "old@gridgo.ph" };

  it("draws the person from Clerk without any GRIDGO record at all", () => {
    // The captain's bug in one assertion: `/me` has answered nothing, and the
    // screen still has a name, an address and a picture to draw.
    expect(
      clientIdentity(
        {
          fullName: "Mark David",
          imageUrl: "https://img.clerk.com/mark.jpg",
          hasImage: true,
          primaryEmailAddress: { emailAddress: "mark@david.ph" },
        },
        null,
      ),
    ).toEqual({
      name: "Mark David",
      email: "mark@david.ph",
      imageUrl: "https://img.clerk.com/mark.jpg",
      hasPhoto: true,
    });
  });

  it("prefers Clerk's name and address over GRIDGO's copy", () => {
    const identity = clientIdentity(
      {
        fullName: "Mark David",
        primaryEmailAddress: { emailAddress: "new@gridgo.ph" },
      },
      gridgo,
    );
    expect(identity.name).toBe("Mark David");
    expect(identity.email).toBe("new@gridgo.ph");
  });

  it("falls back to GRIDGO while Clerk has not loaded", () => {
    expect(clientIdentity(null, gridgo)).toEqual({
      name: "Mark D",
      email: "old@gridgo.ph",
      imageUrl: null,
      hasPhoto: false,
    });
  });

  it("builds a name from the parts when Clerk has no fullName", () => {
    expect(clientIdentity({ firstName: "Ana", lastName: "Bautista" }, null).name).toBe(
      "Ana Bautista",
    );
  });

  it("never draws Clerk's generated initials avatar as a photo", () => {
    // Clerk serves an `imageUrl` for every user, photo or not. Drawing that
    // would put a second, differently-styled monogram inside GRIDGO's own.
    const identity = clientIdentity(
      { imageUrl: "https://img.clerk.com/generated.png", hasImage: false },
      gridgo,
    );
    expect(identity.imageUrl).toBeNull();
    expect(identity.hasPhoto).toBe(false);
  });

  it("says it knows nobody rather than guessing", () => {
    expect(clientIdentity(null, null)).toEqual({
      name: "",
      email: "",
      imageUrl: null,
      hasPhoto: false,
    });
  });
});

/*
 * Expo 57's own multipart serializer, which is what failed on Android. Clerk
 * appends `file` to a FormData and Expo's fetch turns each part into bytes, so
 * running the real serializer is the honest test of what leaves the phone.
 */
const { convertFormDataAsync } = jest.requireActual<{
  convertFormDataAsync: (form: FormData) => Promise<{ body: Uint8Array }>;
}>("expo/src/winter/fetch/convertFormData");
const { installFormDataPatch } = jest.requireActual<{
  installFormDataPatch: (form: typeof FormData) => typeof FormData;
}>("expo/src/winter/FormData");
const NativeFormData = installFormDataPatch(
  jest.requireActual("react-native/Libraries/Network/FormData").default,
);
globalThis.TextEncoder ??= TextEncoder as unknown as typeof globalThis.TextEncoder;

const JPEG = new Uint8Array([255, 216, 255, 217]);
const PICKED = "file:///mock/cache/portrait.jpg";

/** The multipart body Clerk's upload would send for this file. */
async function multipartBody(file: Blob | File | string | null): Promise<Buffer> {
  const form = new NativeFormData();
  form.append("file", file as Blob);
  return Buffer.from((await convertFormDataAsync(form)).body);
}

describe("portraitFile", () => {
  beforeEach(() => {
    // jest-expo backs the real File class with an in-memory file system.
    new DeviceFile(PICKED).write(JPEG);
  });

  it("reproduces the Android failure: the old descriptor is not a multipart part", async () => {
    const descriptor = { uri: PICKED, name: "client-photo.jpg", type: "image/jpeg" };
    await expect(multipartBody(descriptor as unknown as Blob)).rejects.toThrow(
      "Unsupported FormDataPart implementation",
    );
  });

  it("hands Clerk a device File whose bytes are the picture, never the path", async () => {
    const file = portraitFile({ uri: PICKED });
    expect(file).toBeInstanceOf(DeviceFile);

    const body = await multipartBody(file);
    expect(body.includes(Buffer.from(JPEG))).toBe(true);
    expect(body.toString()).toContain('filename="portrait.jpg"');
    expect(body.toString()).not.toContain("file://");
  });

  it("passes a browser's own File through untouched", () => {
    const browser = new Blob([JPEG], { type: "image/jpeg" }) as File;
    expect(portraitFile({ uri: "blob:web", file: browser })).toBe(browser);
  });
});

describe("changeClientPhoto", () => {
  const user = {
    setProfileImage: jest.fn(async ({ file }: { file: Blob | File | string | null }) => {
      // Fail exactly where Android failed if the file is not real bytes.
      await multipartBody(file);
    }),
    reload: jest.fn(async () => undefined),
  };

  beforeEach(() => {
    new DeviceFile(PICKED).write(JPEG);
    user.setProfileImage.mockClear();
    user.reload.mockClear();
    ImagePicker.launchImageLibraryAsync.mockReset();
  });

  it("uploads the picked picture's bytes and re-reads the sign-in", async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: PICKED, mimeType: "image/jpeg", fileName: "IMG_0421.jpg" }],
    });

    expect(await changeClientPhoto(user)).toEqual({ status: "ok" });
    expect(user.setProfileImage).toHaveBeenCalledWith({ file: expect.any(DeviceFile) });
    // The reload is what puts the new picture on screen straight away.
    expect(user.reload).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the client closes the picker", async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });
    expect(await changeClientPhoto(user)).toEqual({ status: "cancelled" });
    expect(user.setProfileImage).not.toHaveBeenCalled();
  });

  it.each([
    new Error(
      "ClerkJS: Network error at /v1/me/profile_image: Unsupported FormDataPart implementation",
    ),
    clerkError("file_too_large", "Raw service response"),
  ])("says a failed save plainly and holds the photo for Try again", async (error) => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: PICKED }],
    });
    user.setProfileImage.mockRejectedValueOnce(error);

    const outcome = await changeClientPhoto(user);
    expect(outcome).toEqual({ status: "failed", message: PORTRAIT_FAILED, photo: { uri: PICKED } });
    expect(JSON.stringify(outcome)).not.toMatch(/FormDataPart|Raw service|ClerkJS/);
    expect(user.reload).not.toHaveBeenCalled();

    // Try again sends the same picture without reopening the library.
    if (outcome.status !== "failed" || !outcome.photo) throw new Error("no photo held");
    expect(await saveClientPhoto(user, outcome.photo)).toEqual({ status: "ok" });
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(user.reload).toHaveBeenCalledTimes(1);
  });

  it("asks for a fresh choice once the held photo has gone from the phone", async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: PICKED }],
    });
    user.setProfileImage.mockRejectedValueOnce(new Error("Network request failed"));

    const failed = await changeClientPhoto(user);
    if (failed.status !== "failed" || !failed.photo) throw new Error("no photo held");

    // Android clears the picker's cache while GRIDGO is in the background.
    new DeviceFile(PICKED).delete();
    user.setProfileImage.mockClear();

    const retried = await saveClientPhoto(user, failed.photo);
    expect(retried).toEqual({ status: "failed", message: PORTRAIT_GONE, chooseAgain: true });
    expect(retried).not.toHaveProperty("photo");
    expect(user.setProfileImage).not.toHaveBeenCalled();
  });

  it("drops the photo when it vanishes during the upload", async () => {
    user.setProfileImage.mockImplementationOnce(async ({ file }) => {
      new DeviceFile(PICKED).delete();
      await multipartBody(file);
    });

    expect(await saveClientPhoto(user, { uri: PICKED })).toEqual({
      status: "failed",
      message: PORTRAIT_GONE,
      chooseAgain: true,
    });
  });
});

describe("newEmailProblem", () => {
  it("refuses the address already on the account", () => {
    expect(newEmailProblem("Mark@Gridgo.ph", "mark@gridgo.ph")).toBe(EMAIL_UNCHANGED);
  });

  it("refuses something that is not an address before spending a round trip", () => {
    expect(newEmailProblem("mark@", "old@gridgo.ph")).toMatch(/complete email address/i);
  });

  it("passes a real change", () => {
    expect(newEmailProblem(" new@gridgo.ph ", "old@gridgo.ph")).toBeNull();
  });
});

describe("startEmailChange", () => {
  it("adds the address and sends it a code", async () => {
    const prepareVerification = jest.fn(async () => undefined);
    const created = { id: "ea1", emailAddress: "new@gridgo.ph", prepareVerification };
    const user = { createEmailAddress: jest.fn(async () => created), update: jest.fn() };

    const outcome = await startEmailChange(
      user as never,
      "  new@gridgo.ph  ",
    );

    expect(user.createEmailAddress).toHaveBeenCalledWith({ email: "new@gridgo.ph" });
    expect(prepareVerification).toHaveBeenCalledWith({ strategy: "email_code" });
    expect(outcome).toEqual({ status: "ok", value: created });
  });

  it("tells an address that belongs to somebody else apart from a failure", async () => {
    const user = {
      createEmailAddress: jest.fn(async () => {
        throw clerkError("form_identifier_exists");
      }),
      update: jest.fn(),
    };
    expect(await startEmailChange(user as never, "taken@gridgo.ph")).toEqual({
      status: "already_registered",
    });
  });
});

describe("confirmEmailChange", () => {
  function address(): ClerkEmailAddress {
    return {
      id: "ea1",
      emailAddress: "new@gridgo.ph",
      prepareVerification: jest.fn(async () => undefined),
      attemptVerification: jest.fn(async () => undefined),
    };
  }

  it("verifies the code and makes the address the one that signs in", async () => {
    // Both halves or neither: an address verified but never made primary is a
    // client who answered their email and still signs in with the old one.
    const target = address();
    const user = {
      createEmailAddress: jest.fn(),
      update: jest.fn(async () => undefined),
      reload: jest.fn(async () => undefined),
    };

    const outcome = await confirmEmailChange(user as never, target, " 123456 ");

    expect(target.attemptVerification).toHaveBeenCalledWith({ code: "123456" });
    expect(user.update).toHaveBeenCalledWith({ primaryEmailAddressId: "ea1" });
    expect(user.reload).toHaveBeenCalled();
    expect(outcome).toEqual({ status: "ok", value: "new@gridgo.ph" });
  });

  it("does not make an unverified address primary", async () => {
    const target = address();
    target.attemptVerification = jest.fn(async () => {
      throw clerkError("form_code_incorrect");
    });
    const user = { createEmailAddress: jest.fn(), update: jest.fn() };

    expect((await confirmEmailChange(user as never, target, "000000")).status).toBe("failed");
    expect(user.update).not.toHaveBeenCalled();
  });
});

describe("clerkName", () => {
  it.each([
    ["Ana", { firstName: "Ana", lastName: "" }],
    ["Ana Bautista", { firstName: "Ana", lastName: "Bautista" }],
    ["  Ana   Maria  Bautista Cruz ", { firstName: "Ana", lastName: "Maria Bautista Cruz" }],
  ])("%j becomes the whole of Clerk's name", (typed, expected) => {
    expect(clerkName(typed)).toEqual(expected);
  });
});

describe("syncClerkName", () => {
  /** A Clerk user that keeps any field it is not sent, as Clerk does. */
  function clerkUser(firstName: string, lastName: string) {
    const stored = { firstName, lastName };
    return {
      stored,
      update: jest.fn(async (params: { firstName?: string; lastName?: string }) => {
        if (params.firstName !== undefined) stored.firstName = params.firstName;
        if (params.lastName !== undefined) stored.lastName = params.lastName;
      }),
      reload: jest.fn(async () => undefined),
    };
  }

  function shown(stored: { firstName: string; lastName: string }) {
    return clientIdentity({ firstName: stored.firstName, lastName: stored.lastName }, null).name;
  }

  it.each([
    ["Ana"],
    ["Ana Bautista"],
    ["Ana Maria Bautista"],
    ["Ana Maria de la Cruz Bautista"],
  ])("replaces Ana Maria Bautista with exactly %j", async (typed) => {
    const user = clerkUser("Ana", "Maria Bautista");
    expect(await syncClerkName(user, typed)).toEqual({ status: "ok" });
    expect(shown(user.stored)).toBe(typed);
    expect(user.reload).toHaveBeenCalled();
  });

  it("clears the old surname when the new name is one word (#337)", async () => {
    const user = clerkUser("Ana", "Maria Bautista");
    await syncClerkName(user, "  Mono ");
    expect(user.update).toHaveBeenCalledWith({ firstName: "Mono", lastName: "" });
    expect(shown(user.stored)).toBe("Mono");
  });

  it("reports its own failure rather than throwing away a GRIDGO save", async () => {
    const user = {
      update: jest.fn(async () => {
        throw new Error("offline");
      }),
    };
    expect(await syncClerkName(user, "Ana")).toEqual({ status: "failed" });
  });
});

describe("passwordProblems", () => {
  it("passes a real change", () => {
    const draft = { current: "oldpassword", next: "newpassword", confirm: "newpassword" };
    expect(passwordProblems(draft)).toEqual({});
    expect(passwordReady(draft)).toBe(true);
  });

  it("asks for the current password before anything else", () => {
    expect(
      passwordProblems({ current: "", next: "newpassword", confirm: "newpassword" }).current,
    ).toMatch(/sign in with now/i);
  });

  it("holds the new one to sign-up's own bar, in sign-up's own words", () => {
    expect(
      passwordProblems({ current: "oldpassword", next: "short", confirm: "short" }).next,
    ).toMatch(/at least 8 characters/i);
  });

  it("refuses the password the client already has", () => {
    expect(
      passwordProblems({ current: "samepassword", next: "samepassword", confirm: "samepassword" })
        .next,
    ).toMatch(/already have/i);
  });

  it("catches a typo in the confirmation, on the confirmation", () => {
    const problems = passwordProblems({
      current: "oldpassword",
      next: "newpassword",
      confirm: "newpasswrod",
    });
    expect(problems.confirm).toMatch(/do not match/i);
    expect(problems.next).toBeUndefined();
  });
});

describe("changeSignInPassword", () => {
  const draft = { current: "oldpassword", next: "newpassword", confirm: "newpassword" };

  it("signs every other session out, and does not offer not to", async () => {
    const user = { updatePassword: jest.fn(async () => undefined) };
    expect(await changeSignInPassword(user, draft)).toEqual({ status: "ok" });
    expect(user.updatePassword).toHaveBeenCalledWith({
      currentPassword: "oldpassword",
      newPassword: "newpassword",
      signOutOfOtherSessions: true,
    });
  });

  it("points a wrong current password at the current-password field", async () => {
    // Told apart on purpose: a client pointed at the new password when the old
    // one was the typo retypes the wrong thing until they give up.
    const user = {
      updatePassword: jest.fn(async () => {
        throw clerkError("form_password_incorrect");
      }),
    };
    expect(await changeSignInPassword(user, draft)).toEqual({ status: "wrong_current" });
  });

  it("keeps Clerk's own sentence for anything else", async () => {
    const user = {
      updatePassword: jest.fn(async () => {
        throw clerkError("form_password_pwned", "This password has been found in a breach.");
      }),
    };
    expect(await changeSignInPassword(user, draft)).toEqual({
      status: "failed",
      message: "This password has been found in a breach.",
    });
  });
});
