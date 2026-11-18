import { useState } from "react";
import { View, TextInput, Pressable, type KeyboardTypeOptions } from "react-native";
import { useTheme } from "../theme";
import { TYPE } from "../theme/typography";
import { Text } from "./Text";
import type { Button3DIcon } from "./Button3D";
import { EyeGlyph, EyeOffGlyph } from "./Glyphs";

// Labelled text field for the auth screens: leading glyph, floating-style label,
// optional secure show/hide eye toggle, and an inline error line. Colours come
// only from d.input.*/p.* and all text is through Text variants (no literals).
export function Field({
  label,
  value,
  onChangeText,
  icon: Icon,
  secure,
  keyboardType,
  placeholder,
  autoCapitalize = "none",
  maxLength,
  error,
  testID,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  icon?: Button3DIcon;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  maxLength?: number;
  error?: string | null;
  testID?: string;
  onSubmitEditing?: () => void;
}) {
  const { p, d } = useTheme();
  const [hidden, setHidden] = useState(!!secure);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text variant="label" color="muted" style={{ marginBottom: 6 }}>
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 52,
          paddingHorizontal: 14,
          gap: 10,
          borderRadius: 14,
          backgroundColor: d.input.bg,
          borderWidth: 1,
          borderColor: error ? p.stateDanger : d.input.border,
        }}
      >
        {Icon ? <Icon size={20} color={p.textMuted} strokeWidth={2} /> : null}
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={d.input.placeholder}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          maxLength={maxLength}
          onSubmitEditing={onSubmitEditing}
          style={{ flex: 1, paddingVertical: 12, fontFamily: TYPE.body.fontFamily, fontSize: TYPE.body.fontSize, color: p.text }}
        />
        {secure ? (
          <Pressable
            testID={testID ? `${testID}-toggle` : undefined}
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            onPress={() => setHidden((h) => !h)}
            hitSlop={12}
            style={{ minWidth: 40, minHeight: 40, alignItems: "flex-end", justifyContent: "center" }}
          >
            {hidden ? <EyeGlyph size={20} color={p.textMuted} /> : <EyeOffGlyph size={20} color={p.brand} />}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color={p.stateDanger} style={{ marginTop: 6 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
