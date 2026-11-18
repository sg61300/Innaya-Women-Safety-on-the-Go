import { useState } from "react";
import { View } from "react-native";
import * as Speech from "expo-speech";
import { VoiceFab } from "./VoiceFab";
import { Text } from "./Text";
import { useTheme } from "../theme";
import { dictateOnce } from "../services/sttDictate";

// Amendment 19: the V3 `VoiceFab` is the visual; this wrapper adds the STT
// behaviour. Tapping requests mic/speech permission (re-request if denied),
// optionally speaks a prompt label, listens once, and hands the transcript back
// through `onText`. States map to the FAB's idle / listening / denied visuals.
// X6 (s25): failures now go through the shared dictateOnce() helper and surface a
// visible inline message instead of a silent console.warn.
export function VoiceFabWithSTT({ onText, prompt }: { onText: (text: string) => void; prompt?: string }) {
  const { p } = useTheme();
  const [listening, setListening] = useState(false);
  const [denied, setDenied] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  async function onToggle() {
    if (listening) return;
    setMicError(null);
    setListening(true);
    try {
      if (prompt) Speech.speak(prompt);
      const r = await dictateOnce();
      setDenied(r.kind === "permission");
      if (r.text) onText(r.text);
      else if (r.error) setMicError(r.error);
    } finally {
      setListening(false);
    }
  }

  return (
    <View style={{ alignItems: "center" }}>
      <VoiceFab listening={listening} denied={denied} onToggle={onToggle} />
      {micError ? (
        <Text testID="voice-fab-error" variant="caption" color={p.stateDanger} style={{ marginTop: 6, textAlign: "center" }}>
          {micError}
        </Text>
      ) : null}
    </View>
  );
}
