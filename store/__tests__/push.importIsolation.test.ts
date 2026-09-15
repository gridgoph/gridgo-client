describe("push without a native module", () => {
  it("initializes and stays usable when loading notifications throws", async () => {
    let push!: typeof import("@/store/push");
    jest.isolateModules(() => {
      jest.doMock("expo-constants", () => ({ appOwnership: "standalone" }));
      jest.doMock("expo-notifications", () => {
        throw new Error("Expo Go does not support push");
      });
      push = jest.requireActual("@/store/push");
    });
    expect(push.usePush.getState().permission).toBe("unknown");
    push.usePush.setState({ supported: true });
    expect(push.getNotificationsNative()).toBeNull();
    await expect(push.usePush.getState().syncPermission()).resolves.toBe("unknown");
    await expect(push.usePush.getState().enable()).resolves.toBe(false);
    await expect(push.usePush.getState().registerIfGranted()).resolves.toBeUndefined();
  });
});
