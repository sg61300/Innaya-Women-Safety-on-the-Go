import { Pressable, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "./Text";

// Secondary navigation link (forgot password, login <-> signup switch, change
// email). A bare <Text onPress> gives only a ~24dp touch target; wrapping it in
// a Pressable with hitSlop={12} expands the touch area to >=48dp (global control
// constraint) without disturbing inline layout, and adds the required testID +
// accessibilityLabel and a visible pressed state.
export function TextLink({
  testID,
  label,
  onPress,
  underline = true,
  style,
}: {
  testID: string;
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  underline?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={12}
      style={style}
    >
      {({ pressed }) => (
        <Text
          variant="bodyStrong"
          color="primary"
          style={{ opacity: pressed ? 0.6 : 1, textDecorationLine: underline ? "underline" : "none" }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
