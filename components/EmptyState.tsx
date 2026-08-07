import { Text, View } from "react-native";

type Props = {
  title: string;
  body?: string;
};

/** Quiet empty list / empty panel copy. */
export function EmptyState({ title, body }: Props) {
  return (
    <View className="gg-panel items-center py-8">
      <Text className="text-body-lg font-medium text-text-primary">{title}</Text>
      {body ? <Text className="mt-2 text-center text-body text-text-muted">{body}</Text> : null}
    </View>
  );
}
