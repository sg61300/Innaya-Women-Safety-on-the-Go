import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { stt } from "./stt";
import i18n from "../i18n";

// X6 (s25) — the ONE shared mic-dictation helper used by SafetyWordField and
// VoiceFabWithSTT. Before this, every mic tap requested permission, called
// stt.listenOnce() and swallowed any error into console.warn, so on a Samsung
// phone (where the Google speech app can be absent/disabled) the button looked
// dead. This maps every outcome — permission, no speech, unavailable service —
// to a visible i18n message the caller renders inline.
export type DictateErrorKind = "permission" | "noSpeech" | "unavailable";
export type DictateResult = { text?: string; error?: string; kind?: DictateErrorKind };

export async function dictateOnce(): Promise<DictateResult> {
  try {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) return { error: i18n.t("stt.permissionDenied"), kind: "permission" };
    const text = await stt.listenOnce();
    if (!text || !text.trim()) return { error: i18n.t("stt.noSpeech"), kind: "noSpeech" };
    return { text: text.trim() };
  } catch (e) {
    const m = ((e as Error)?.message ?? "").toLowerCase();
    if (m === "timeout") return { error: i18n.t("stt.noSpeech"), kind: "noSpeech" };
    return { error: i18n.t("stt.unavailable"), kind: "unavailable" };
  }
}
