import { useState } from "react";
import { View, Pressable } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Field } from "./Field";
import { MicGlyph } from "./Glyphs";
import { dictateOnce } from "../services/sttDictate";
import { secureWords } from "../services/secureWords";
import i18n from "../i18n";

// A safety-word input: text field + inline dictation mic + a strength hint.
// TODO(V9): swap the inline strength label for the <SafeWordStrength> component
// (Task V9, Wave 3) once it lands — the meter logic already lives in
// secureWords.strength(), so this is a presentation-only replacement.
export function SafetyWordField({
  label,
  value,
  onChangeText,
  testID,
  secure,
  showStrength,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  testID: string;
  secure?: boolean;
  showStrength?: boolean;
  error?: string | null;
}) {
  const { p } = useTheme();
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  async function dictate() {
    if (listening) return;
    setMicError(null);
    setListening(true);
    try {
      const r = await dictateOnce();
      if (r.text) onChangeText(r.text);
      else if (r.error) setMicError(r.error);
    } finally {
      setListening(false);
    }
  }

  const strength = showStrength && value.trim() ? secureWords.strength(value) : null;
  const strengthColor = strength === "weak" ? p.stateDanger : strength === "ok" ? p.stateWatch : p.stateSafe;
  const strengthLabel =
    strength === "weak" ? i18n.t("words.strengthWeak") : strength === "ok" ? i18n.t("words.strengthOk") : i18n.t("words.strengthStrong");

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Field label={label} value={value} onChangeText={onChangeText} secure={secure} autoCapitalize="none" testID={testID} error={error} />
        </View>
        <View style={{ alignItems: "center", width: 52 }}>
          <Pressable
            testID={`${testID}-mic`}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("words.dictate", { label })}
            accessibilityState={{ selected: listening }}
            onPress={dictate}
            hitSlop={8}
            style={{ marginTop: 26, width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: p.brand, backgroundColor: listening ? p.brandSoft : "transparent" }}
          >
            <MicGlyph size={20} color={p.brand} strokeWidth={2} />
          </Pressable>
          {listening ? <Text variant="caption" color="muted" style={{ marginTop: 3, fontSize: 10 }}>{i18n.t("words.listening")}</Text> : null}
        </View>
      </View>
      {micError ? (
        <Text testID={`${testID}-mic-error`} variant="caption" color={p.stateDanger} style={{ marginTop: 2, marginBottom: 6 }}>
          {micError}
        </Text>
      ) : null}
      {strength ? (
        <Text variant="caption" color={strengthColor} style={{ marginTop: -6, marginBottom: 8 }}>
          {strengthLabel}
        </Text>
      ) : null}
    </View>
  );
}
