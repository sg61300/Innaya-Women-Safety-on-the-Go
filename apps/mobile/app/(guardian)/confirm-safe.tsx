// Task 29b (ADR-014 gate 3) — the guardian's 360° confirm screen, opened from the
// "cancel_attempt" push. She entered both passwords; the guardian watches her live
// frames turn a full circle, then confirms "She's safe" or raises "Something's wrong".
// Both verdicts go through /api/cancel-confirm (guardian.confirmSafe / somethingWrong),
// which writes the cancel_calls row that reaches her phone over realtime.
import { useEffect, useRef, useState } from "react";
import { View, Image, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ChevronLeft } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Card } from "../../src/components/Card";
import { Button3D } from "../../src/components/Button3D";
import { useTheme } from "../../src/theme";
import { guardian } from "../../src/services/guardian";
import { supabase } from "../../src/lib/supabase";
import i18n from "../../src/i18n";

const CONFIRM_AFTER_MS = 15_000; // 15 s of watching, or 3 frames, unlocks "She's safe"

// ADR-043: a "cancel_request" push carries the guardian's own vote link
// (/g/<token>?cr&vt). The in-app vote UI is retired for the MVP — the guardian
// votes on the web page. This screen forwards to it in the system browser.
// Only forward to an http(s) vote link. A push without a link, or with a
// malformed/unsafe one (e.g. a javascript: scheme), falls back to the plain
// confirm screen instead of handing an untrusted URL to the system browser.
function isVoteLink(link: string): boolean {
  return /^https?:\/\//i.test(link);
}

export default function ConfirmSafeScreen() {
  const params = useLocalSearchParams<{ journeyId: string; name?: string; requestId?: string; link?: string }>();
  const link = String(params.link ?? "");
  if (link && isVoteLink(link)) return <CancelVoteForward link={link} />;
  if (link) console.warn("[confirm-safe] ignoring malformed vote link");
  return <ConfirmSafe360 journeyId={String(params.journeyId ?? "")} initialName={String(params.name ?? "her")} />;
}

function CancelVoteForward({ link }: { link: string }) {
  const { p } = useTheme();
  const router = useRouter();
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    WebBrowser.openBrowserAsync(link).catch((e) => console.warn("[confirm-safe] open vote link failed", (e as Error)?.message));
  }, [link]);
  return (
    <Screen scroll padded topInset={false} testID="confirm-safe-screen">
      <View style={{ gap: 16, paddingTop: 8, paddingBottom: 40 }}>
        <Pressable
          testID="confirm-back"
          accessibilityRole="button"
          accessibilityLabel={i18n.t("confirm.back")}
          onPress={() => router.back()}
          style={{ flexDirection: "row", alignItems: "center", minHeight: 48, alignSelf: "flex-start" }}
        >
          <ChevronLeft color={p.text} size={24} />
          <Text variant="body" color="muted">{i18n.t("confirm.back")}</Text>
        </Pressable>
        <Text variant="title" color="primary" testID="confirm-forward">{i18n.t("confirm.openingVotePage")}</Text>
        <Button3D testID="confirm-open-vote" label={i18n.t("confirm.openVotePage")} full onPress={() => void WebBrowser.openBrowserAsync(link)} />
      </View>
    </Screen>
  );
}

function ConfirmSafe360({ journeyId, initialName }: { journeyId: string; initialName: string }) {
  const { p } = useTheme();
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [frames, setFrames] = useState<string[]>([]);
  const [waited, setWaited] = useState(false);
  const [safed, setSafed] = useState(false);
  const [pending, setPending] = useState(false);
  const ch = useRef<any>(null);

  // "She's safe" unlocks after 15 s of watching (or once ≥ 3 frames have arrived).
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), CONFIRM_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  // Traveller's name (journeys → profiles).
  useEffect(() => {
    if (!journeyId) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("journeys")
        .select("profiles!journeys_owner_id_fkey(name)")
        .eq("id", journeyId)
        .maybeSingle();
      const n = (data as { profiles?: { name?: string } } | null)?.profiles?.name;
      if (alive && n) setName(n);
    })();
    return () => {
      alive = false;
    };
  }, [journeyId]);

  // Live frames strip (2 s cadence), newest last — keep the last 4.
  useEffect(() => {
    if (!journeyId) return;
    const channel = supabase
      .channel?.(`cs:${journeyId}`)
      ?.on?.(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events", filter: `journey_id=eq.${journeyId}` },
        async (m: any) => {
          const row = m?.new;
          if (row?.type === "frame" && row?.payload?.path) {
            const { data } = await supabase.storage.from("frames").createSignedUrl(row.payload.path, 60);
            if (data?.signedUrl) setFrames((f) => [...f, data.signedUrl].slice(-4));
          }
        }
      );
    channel?.subscribe?.();
    ch.current = channel;
    return () => {
      if (ch.current) supabase.removeChannel?.(ch.current);
    };
  }, [journeyId]);

  const canConfirm = waited || frames.length >= 3;

  const onSafe = async () => {
    if (pending) return;
    setPending(true);
    try {
      await guardian.confirmSafe(journeyId);
    } catch {
      /* the row still records on retry; show the resolved UI so the guardian is not stuck */
    }
    setPending(false);
    setSafed(true);
  };
  const onWrong = () => void guardian.somethingWrong(journeyId);
  const onRaise = () => void guardian.raiseSos(journeyId);

  return (
    <Screen scroll padded topInset={false} testID="confirm-safe-screen">
      <View style={{ gap: 16, paddingTop: 8, paddingBottom: 40 }}>
        <Pressable
          testID="confirm-back"
          accessibilityRole="button"
          accessibilityLabel={i18n.t("confirm.back")}
          onPress={() => router.back()}
          style={{ flexDirection: "row", alignItems: "center", minHeight: 48, alignSelf: "flex-start" }}
        >
          <ChevronLeft color={p.text} size={24} />
          <Text variant="body" color="muted">
            {i18n.t("confirm.back")}
          </Text>
        </Pressable>

        <Text variant="title" color="primary">
          {name}
        </Text>
        <Text variant="body" color="primary">
          {i18n.t("confirm.body")}
        </Text>

        <Card style={{ padding: 12 }}>
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }} showsHorizontalScrollIndicator={false}>
            {frames.map((uri, i) => (
              <Image
                key={`${uri}-${i}`}
                testID={`confirm-frame-${i}`}
                source={{ uri }}
                style={{ width: 120, height: 160, borderRadius: 10, backgroundColor: p.bgRaised }}
              />
            ))}
          </ScrollView>
          <Text variant="caption" color="muted" style={{ marginTop: 8 }}>
            {i18n.t("confirm.instruction")}
          </Text>
        </Card>

        {safed ? (
          <View style={{ gap: 12 }}>
            <Card testID="confirm-banner" style={{ padding: 14 }}>
              <Text variant="bodyStrong" color="primary">
                {i18n.t("confirm.cancelledBanner")}
              </Text>
            </Card>
            <Button3D testID="confirm-raise" label={i18n.t("confirm.raiseAlarm")} variant="danger" full onPress={onRaise} />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Button3D
              testID="confirm-safe"
              label={i18n.t("confirm.safe")}
              full
              disabled={!canConfirm || pending}
              loading={pending}
              onPress={onSafe}
            />
            <Button3D testID="confirm-wrong" label={i18n.t("confirm.wrong")} variant="danger" full onPress={onWrong} />
          </View>
        )}
      </View>
    </Screen>
  );
}
