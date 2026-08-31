import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { DateTimeField } from "@/components/form/DateTimeField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { findCategory } from "@/lib/productCategories";
import * as api from "@/lib/api";
import { prefetchMatch } from "@/lib/matchPrefetch";
import { needsDropoffFirst } from "@/hooks/useStartPrintJob";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";

/**
 * When the client needs it.
 *
 * The one question worth asking before a shop is chosen, because a date means
 * the same thing at every shop whatever unit it sells in. Quantity cannot come
 * this early for the same reason in reverse: "how many" has no meaning until a
 * listing says what one of them is.
 *
 * It is a filter, not a preference. A shop that cannot finish by this is not
 * offered at all rather than ranked below one that can — "can you make Friday"
 * is not something to weigh against a price, and a marketplace that treats it
 * as one hands over the best shop that happens to miss the date and only admits
 * it at checkout.
 *
 * "No rush" is a real answer and the screen says so, because a client with no
 * deadline should not have to invent one to get past this.
 */
export default function WhenScreen() {
  const router = useRouter();
  const { subcategory, category } = useLocalSearchParams<{
    subcategory?: string;
    category?: string;
  }>();

  const setDeadline = useJobDeadline((state) => state.set);
  const cart = useCart((state) => state.cart);
  const cartId = useCart((state) => state.cartId);
  const dropoff = cart?.defaultDropoff ?? null;

  const [chosen, setChosen] = useState("");

  const bounds = useMemo(() => {
    const now = new Date();
    return {
      // Nothing can be printed and delivered in the next hour, and offering it
      // would only produce a match that fails.
      minimum: new Date(now.getTime() + 60 * 60 * 1000),
      suggested: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      maximum: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
    };
  }, []);

  const thing = useMemo(() => {
    const found = findCategory(api.productCategoriesNow(), category ?? "")?.subcategories.find(
      (entry) => entry.code === subcategory,
    );
    return (found?.name ?? "this").toLowerCase();
  }, [category, subcategory]);

  const go = (by: string | null) => {
    setDeadline(by);
    const needsDropoff = needsDropoffFirst(dropoff);
    if (!needsDropoff && subcategory) {
      prefetchMatch({
        subcategoryCode: subcategory,
        dropoff,
        deadline: by,
        ...(cartId ? { cartId } : {}),
      });
    }
    router.push({
      pathname: needsDropoff ? "/request/where" : "/request/match",
      params: { subcategory: subcategory ?? "", category: category ?? "" },
    });
  };

  return (
    <Screen edges={["bottom"]}>
      <View className="gg-screen gg-page flex-1 pt-2">
        <Text className="text-h1 text-text-primary">When do you need your {thing}?</Text>
        <Text className="mt-3 text-body-lg text-text-secondary">
          GRIDGO only offers you a printer that can actually make it. Nobody who
          cannot is put in front of you.
        </Text>

        <View className="mt-8 gap-3">
          <DateTimeField
            value={chosen}
            onChange={setChosen}
            suggested={bounds.suggested}
            minimumDate={bounds.minimum}
            maximumDate={bounds.maximum}
            placeholder="Pick a date and time"
            accessibilityLabel="When you need this by"
          />
        </View>

        <View className="mt-auto gap-3 pb-2">
          <PrimaryButton
            label="Find my printer"
            onPress={() => go(chosen || null)}
            disabled={!chosen}
          />
          {/*
            A second, quieter way through. A client with no deadline should not
            have to invent one, and inventing one would filter out shops that
            could have done the job.
          */}
          <SecondaryButton label="No rush — show me anyone" onPress={() => go(null)} />
        </View>
      </View>
    </Screen>
  );
}
