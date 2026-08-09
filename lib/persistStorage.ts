import AsyncStorage from "@react-native-async-storage/async-storage";
import { createJSONStorage, type StateStorage } from "zustand/middleware";

const serverStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export function createPersistStorage<State>() {
  return createJSONStorage<State>(() =>
    typeof window === "undefined" ? serverStorage : AsyncStorage,
  );
}
