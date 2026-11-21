import { useEffect } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Button3D } from "./Button3D";
import { PhotoRetentionNotice } from "./PhotoRetentionNotice";
import i18n from "../i18n";
import { useJourney } from "../store/journey";
import { frameQueue } from "../services/frameQueue";
import { isLive } from "../services/safetyMarker";

// Founder Q117, Q118: after the trip, may the phone copies of uploaded offline photos go?
// Same plain card as CancelWaitingNotice. Never shown during a trip.
export function PhotoCleanupPrompt() {
  const { p } = useTheme();
  const insets = useSafeAreaInsets();
  const live = useJourney(isLive);
  const count = useJourney((s) => s.photoCleanup);
  useEffect(() => { void frameQueue.offerCleanup(); }, [live]);
  if (live || !count) return null;
  return (
    <View
      testID="photo-cleanup"
      pointerEvents="box-none"
      style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, zIndex: 20, padding: 12, gap: 8, borderRadius: 14, backgroundColor: p.brandSoft }}
    >
      <Text variant="bodyStrong" testID="photo-cleanup-title">{i18n.t("photoCleanup.title")}</Text>
      <Text variant="body">{i18n.t("photoCleanup.body", { count })}</Text>
      <PhotoRetentionNotice />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}><Button3D label={i18n.t("photoCleanup.delete")} onPress={() => void frameQueue.deleteUploaded()} full testID="photo-cleanup-delete" /></View>
        <View style={{ flex: 1 }}><Button3D label={i18n.t("photoCleanup.keep")} onPress={() => frameQueue.keep()} variant="ghost" full testID="photo-cleanup-keep" /></View>
      </View>
    </View>
  );
}
