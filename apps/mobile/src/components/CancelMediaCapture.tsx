import { useRef, useState } from "react";
import { View } from "react-native";
import { CameraView } from "expo-camera";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Button3D } from "./Button3D";
import i18n from "../i18n";

// ADR-043 item 4, step 4 — the wearer's own consented proof. Front camera,
// UNMASKED (it is her own evidence), photo or video ≤ 15 s. On capture it hands
// the local file URI up; the parent (CancelFlow) uploads to the private selfies
// bucket and only then opens the guardian request. The native capture is behind
// an injectable `capture` layer so the flow is unit-testable without a device.
export const VIDEO_MAX_SEC = 15;

export type MediaCapture = {
  takePhoto: () => Promise<string>; // resolves the local file URI
  recordVideo: () => Promise<string>; // resolves when recording stops (≤ VIDEO_MAX_SEC)
};

export function CancelMediaCapture({
  onCaptured,
  capture,
}: {
  onCaptured: (localUri: string, method: "photo" | "video") => void;
  capture?: MediaCapture;
}) {
  const { p, d } = useTheme();
  const camRef = useRef<CameraView | null>(null);
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  // Default capture reads the live CameraView ref. maxDuration caps the clip at
  // 15 s natively, so the recordAsync promise resolves on its own at the limit.
  const cap: MediaCapture = capture ?? {
    takePhoto: async () => {
      const pic = await camRef.current?.takePictureAsync?.({ quality: 0.5, skipProcessing: true });
      const uri = pic?.uri;
      if (!uri) throw new Error("no photo");
      return uri;
    },
    recordVideo: async () => {
      const clip = await camRef.current?.recordAsync?.({ maxDuration: VIDEO_MAX_SEC });
      const uri = clip?.uri;
      if (!uri) throw new Error("no video");
      return uri;
    },
  };

  const takePhoto = async () => {
    if (busy) return;
    setBusy(true);
    try {
      onCaptured(await cap.takePhoto(), "photo");
    } catch {
      /* parent shows the capture/upload error; stay on this screen */
    } finally {
      setBusy(false);
    }
  };

  const recordVideo = async () => {
    if (busy || recording) return;
    setBusy(true);
    setRecording(true);
    try {
      const uri = await cap.recordVideo();
      onCaptured(uri, "video");
    } catch {
      /* stay on this screen */
    } finally {
      setRecording(false);
      setBusy(false);
    }
  };

  return (
    <View testID="cancel-media" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
      <Text variant="display">{i18n.t("cancelFlow.mediaTitle")}</Text>
      <Text variant="body" color={p.textMuted} style={{ textAlign: "center" }}>{i18n.t("cancelFlow.mediaSub")}</Text>
      <CameraView ref={(r) => { camRef.current = r; }} facing="front" testID="cancel-media-cam" style={{ width: 220, height: 220, borderRadius: 16 }} />
      <View style={{ flexDirection: "row", alignSelf: "stretch", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button3D label={i18n.t("cancelFlow.photo")} onPress={() => setMode("photo")} variant={mode === "photo" ? "primary" : "ghost"} full testID="cancel-media-mode-photo" />
        </View>
        <View style={{ flex: 1 }}>
          <Button3D label={i18n.t("cancelFlow.video")} onPress={() => setMode("video")} variant={mode === "video" ? "primary" : "ghost"} full testID="cancel-media-mode-video" />
        </View>
      </View>
      {recording ? <Text testID="cancel-media-recording" variant="caption" color={d.sos}>{i18n.t("cancelFlow.recording", { n: VIDEO_MAX_SEC })}</Text> : null}
      <Button3D
        label={i18n.t("cancelFlow.send")}
        onPress={mode === "photo" ? takePhoto : recordVideo}
        disabled={busy}
        full
        testID="cancel-media-capture"
      />
    </View>
  );
}
