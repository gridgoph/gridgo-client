import {
  changeClientPhoto,
  changeSignInPassword,
  clientIdentity,
  confirmEmailChange,
  EMAIL_UNCHANGED,
  newEmailProblem,
  passwordProblems,
  passwordReady,
  portraitFile,
  startEmailChange,
  syncClerkName,
  type ClerkEmailAddress,
} from "@/lib/clerkIdentity";

jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core") as Record<string, unknown>;
  return {
    ...actual,
    requireOptionalNativeModule: (name: string) =>
      name === "ExponentImagePicker" ? { name } : null,
  };
});

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

describe("portraitFile", () => {
  it("hands React Native's own FormData descriptor to Clerk", () => {
    // Not a bare `file://` string: Clerk sends a string body verbatim as
    // octet-stream, which stores the path itself as the picture.
    expect(portraitFile({ uri: "file:///tmp/a.png", mimeType: "image/png" })).toEqual({
      uri: "file:///tmp/a.png",
      name: "client-photo.png",
      type: "image/png",
    });
  });

  it("names an unnamed pick rather than leaving IMG_0421 on the account", () => {
    expect(portraitFile({ uri: "file:///tmp/a.jpg" }).name).toBe("client-photo.jpg");
  });
});

describe("changeClientPhoto", () => {
  const user = {
    setProfileImage: jest.fn(async () => undefined),
    reload: jest.fn(async () => undefined),
  };

  beforeEach(() => {
    user.setProfileImage.mockClear();
    user.reload.mockClear();
    ImagePicker.launchImageLibraryAsync.mockReset();
  });

  it("saves a picked picture onto the sign-in", async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/a.png", mimeType: "image/png" }],
    });

    expect(await changeClientPhoto(user)).toEqual({ status: "ok" });
    expect(user.setProfileImage).toHaveBeenCalledWith({
      file: { uri: "file:///tmp/a.png", name: "client-photo.png", type: "image/png" },
    });
    expect(user.reload).toHaveBeenCalled();
  });

  it("stays quiet when the client closes the picker", async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });
    expect(await changeClientPhoto(user)).toEqual({ status: "cancelled" });
    expect(user.setProfileImage).not.toHaveBeenCalled();
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

describe("syncClerkName", () => {
  it("splits one typed name into the two fields Clerk stores", async () => {
    const user = { update: jest.fn(async () => undefined), reload: jest.fn(async () => undefined) };
    expect(await syncClerkName(user, "  Ana Maria Bautista  ")).toEqual({ status: "ok" });
    expect(user.update).toHaveBeenCalledWith({
      firstName: "Ana",
      lastName: "Maria Bautista",
    });
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
