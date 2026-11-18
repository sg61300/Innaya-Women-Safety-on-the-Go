import { View } from "react-native";
import { useTheme, type ChipKind } from "../theme";
import { Chip } from "./Chip";
import i18n from "../i18n";
import { secureWords } from "../services/secureWords";

// Presentational strength meter for a safe word. The verdict comes from
// secureWords.strength() (Task 20) — this component only paints it: a 3-segment
// bar plus a Chip label, using the danger/amber/safe chip colours so the text
// always clears the same WCAG guard as every other chip (contrast test).
const KIND: Record<ReturnType<typeof secureWords.strength>, ChipKind> = {
  weak: "danger",
  ok: "amber",
  strong: "safe",
};
const FILLED: Record<ReturnType<typeof secureWords.strength>, number> = {
  weak: 1,
  ok: 2,
  strong: 3,
};
const LABEL_KEY: Record<ReturnType<typeof secureWords.strength>, string> = {
  weak: "words.strengthWeak",
  ok: "words.strengthOk",
  strong: "words.strengthStrong",
};

export function SafeWordStrength({ word }: { word: string }) {
  const { p, d } = useTheme();
  const level = secureWords.strength(word);
  const kind = KIND[level];
  const fillColor = d.chip[kind].fg;
  const filled = FILLED[level];

  return (
    <View testID="safewordstrength" style={{ gap: 8, alignSelf: "stretch" }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            testID={`safewordstrength-seg-${i}`}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: i < filled ? fillColor : p.border,
            }}
          />
        ))}
      </View>
      <Chip kind={kind} label={i18n.t(LABEL_KEY[level])} testID="safewordstrength-chip" />
    </View>
  );
}
