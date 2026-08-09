import AsyncStorage from "@react-native-async-storage/async-storage";

import { createPersistStorage } from "@/lib/persistStorage";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function setWindow(value: unknown) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value,
  });
}

describe("createPersistStorage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("uses AsyncStorage when a DOM runtime is present", async () => {
    setWindow({});
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(
      JSON.stringify({ state: { preference: "dark" } }),
    );

    const storage = createPersistStorage<{ preference: string }>();

    await expect(storage?.getItem("theme")).resolves.toEqual({
      state: { preference: "dark" },
    });
    await storage?.setItem("theme", { state: { preference: "dark" } });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "theme",
      JSON.stringify({ state: { preference: "dark" } }),
    );
  });

  it("treats server-side storage as empty and ignores writes", async () => {
    setWindow(undefined);

    const storage = createPersistStorage<{ preference: string }>();

    expect(await storage?.getItem("theme")).toBeNull();
    expect(() =>
      storage?.setItem("theme", { state: { preference: "dark" } }),
    ).not.toThrow();
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
