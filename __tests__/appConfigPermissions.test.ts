import app from "../app.json";

const restricted = [
  "READ_MEDIA_IMAGES",
  "READ_MEDIA_VIDEO",
  "READ_MEDIA_AUDIO",
  "READ_MEDIA_VISUAL_USER_SELECTED",
  "READ_EXTERNAL_STORAGE",
  "WRITE_EXTERNAL_STORAGE",
  "FOREGROUND_SERVICE_MEDIA_PLAYBACK",
];

it("keeps occasional uploads free of broad media and background playback permissions", () => {
  expect(app.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === "expo-audio"))
    .toEqual(["expo-audio", { enableBackgroundPlayback: false }]);
  for (const name of restricted) {
    expect(app.expo.android.blockedPermissions).toContain(`android.permission.${name}`);
    expect(app.expo.android.permissions).not.toContain(name);
    expect(app.expo.android.permissions).not.toContain(`android.permission.${name}`);
  }
  expect(app.expo.android.blockedPermissions).not.toContain("android.permission.FOREGROUND_SERVICE");
  expect(app.expo.android.blockedPermissions).not.toContain("android.permission.RECORD_AUDIO");
});
