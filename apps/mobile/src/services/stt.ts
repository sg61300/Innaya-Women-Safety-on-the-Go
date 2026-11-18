import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionResultEvent,
  type ExpoSpeechRecognitionErrorEvent,
} from "expo-speech-recognition";

// One-shot speech-to-text (ADR-034: expo-speech-recognition, not the removed
// @react-native-voice/voice). Starts recognition, resolves with the first final
// transcript, and always tears down its listeners + the timeout so a caller can
// never leak a subscription or double-resolve.
export const stt = {
  listenOnce(timeoutMs = 8000, lang = "en-IN"): Promise<string> {
    return new Promise((resolve, reject) => {
      let done = false;
      const settle = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resSub.remove();
        errSub.remove();
        try {
          ExpoSpeechRecognitionModule.stop();
        } catch {
          /* stop after teardown is best-effort */
        }
        fn();
      };
      const timer = setTimeout(() => settle(() => reject(new Error("timeout"))), timeoutMs);
      const resSub = ExpoSpeechRecognitionModule.addListener("result", (e: ExpoSpeechRecognitionResultEvent) => {
        if (!e.isFinal) return;
        settle(() => resolve(e.results?.[0]?.transcript ?? ""));
      });
      const errSub = ExpoSpeechRecognitionModule.addListener("error", (e: ExpoSpeechRecognitionErrorEvent) => {
        settle(() => reject(new Error(e.message || e.error || "stt")));
      });
      ExpoSpeechRecognitionModule.start({ lang, interimResults: false });
    });
  },
};
