import { useEffect, useState } from "react";
import { View, Pressable, Keyboard, AppState } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Card } from "../../src/components/Card";
import { Button3D } from "../../src/components/Button3D";
import { SafetyWordField } from "../../src/components/SafetyWordField";
import { secureWords } from "../../src/services/secureWords";
import { supabase } from "../../src/lib/supabase";
import { events } from "../../src/lib/events";
import { useTheme } from "../../src/theme";
import i18n from "../../src/i18n";

const MAX_EMERGENCY = 3;

export default function SafetyWords() {
  const { p } = useTheme();
  // T3: re-entry to edit the words — prefill them from the device store.
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const editingProfile = reason === "edit";
  const [emergency, setEmergency] = useState<string[]>([""]);
  const [police, setPolice] = useState("");
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [navPending, setNavPending] = useState(false);

  useEffect(() => {
    if (reason !== "edit") return;
    (async () => {
      const [em, pol] = await Promise.all([
        secureWords.get("emergency"),
        secureWords.get("police_keyword"),
      ]);
      if (em.length) setEmergency(em);
      if (pol.length) setPolice(pol[0]);
    })();
  }, [reason]);

  // G3: run the post-save navigation from an effect. Setting `navPending` in
  // save() and replacing here moves the route swap off save()'s synchronous frame
  // (and off the Keyboard.dismiss() call) onto a later React commit, so it no
  // longer races the Fabric surface remount that destroyed the ReactInstance
  // (b8 logcat: safety_words_set → "Destroying ReactInstance" ~1 s later, no new
  // "Running main"). Same shape as the D1(a) permissions fix: if the app is not
  // foreground-active (e.g. an IME/host transition is mid-flight) wait for it to
  // return to "active" before replacing.
  useEffect(() => {
    if (!navPending) return;
    const go = () => router.replace(editingProfile ? "/(user)/profile?saved=1" as never : "/(setup)/consent");
    if (AppState.currentState === "background" || AppState.currentState === "inactive") {
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") {
          sub.remove();
          go();
        }
      });
      return () => sub.remove();
    }
    go();
  }, [navPending, editingProfile]);

  const filledEmergency = emergency.map((w) => w.trim()).filter(Boolean);
  const canSave = filledEmergency.length > 0 && !busy;

  function setWord(i: number, v: string) {
    setEmergency((list) => list.map((w, j) => (j === i ? v : w)));
  }
  function addWord() {
    setEmergency((list) => (list.length < MAX_EMERGENCY ? [...list, ""] : list));
  }
  function removeWord(i: number) {
    setEmergency((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : list));
  }

  async function save() {
    if (busy) return;
    setSaveErr(null);
    // ADR-043 rule 10: the emergency password is retired. Only the safety words
    // (and the optional police keyword) are set here.
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) throw new Error("no-session");
      const { data: prof } = await supabase.from("profiles").select("word_salt").eq("id", userId).single();
      // G2: NEVER fall back to an empty salt. `word_salt` is NOT NULL in the DB
      // (0001_init.sql: default gen_random_bytes), so a missing value here means the
      // profile row could not be read (offline / RLS / transient), NOT that the salt
      // is blank. Writing hashWord(pw, "") would persist an emergency-password hash
      // that gate 2 — which verifies against the real word_salt — can never match,
      // silently trapping the wearer in CRITICAL (b9 class). Fail the save so she
      // retries once the row is readable, rather than storing an un-verifiable hash.
      const salt = prof?.word_salt;
      if (!salt) throw new Error("no-salt");
      const policeWords = police.trim() ? [police.trim()] : [];
      // Sync the server first: the routing gate keys on device words, so if the
      // server sync fails we must not have already written the device (a relaunch
      // would then pass the gate with nothing on the server). Persist on the
      // device only after both server writes succeed.
      await secureWords.syncHashes(userId, salt, { emergency: filledEmergency, police_keyword: policeWords });
      await secureWords.save("emergency", filledEmergency);
      await secureWords.save("police_keyword", policeWords);
      await events.log("safety_words_set", { count: filledEmergency.length });
      // D1(b): dismiss the soft keyboard before navigating. A replace fired with
      // the keyboard still up left the consent screen blank in-session (a cold
      // restart recovered, so the gate was fine — the navigation was not).
      Keyboard.dismiss();
      // G3: firing `router.replace` in the SAME synchronous frame as
      // `Keyboard.dismiss()` raced the Fabric surface remount — on b8 the logcat
      // showed `safety_words_set` then "Destroying ReactInstance" ~1 s later with
      // no new "Running main", i.e. the instance was torn down (same class as the
      // D1(a) permissions bug: SurfaceMountingManager "View already has a parent"
      // → ModuleRegistry/ReactInstance destroyed → permanent blank). Defer the
      // replace to a later React commit (via the navPending effect below) so the
      // keyboard-hide surface teardown finishes before the route swap.
      setNavPending(true);
    } catch (e) {
      setSaveErr(i18n.t("words.saveError"));
      console.warn("[words] save failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      scroll
      padded
      testID="safety-words-screen"
      header={
        // X3: the Back control stays fixed at the top instead of scrolling away.
        <Pressable
          testID="words-back"
          accessibilityRole="button"
          accessibilityLabel={i18n.t("common.back")}
          // F4: this screen is reached via router.replace (from profile / the
          // ?reason=password deep link), so there is no history and router.back() is
          // a no-op. Fall back to the profile screen — never "/", whose decideRoute
          // would send an incomplete setup straight back here and loop.
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(setup)/profile"))}
          style={{ flexDirection: "row", alignItems: "center", minHeight: 48, alignSelf: "flex-start", marginTop: 8 }}
        >
          <ChevronLeft color={p.text} size={24} />
          <Text variant="body" color="muted">{i18n.t("common.back")}</Text>
        </Pressable>
      }
    >
      <View style={{ paddingTop: 24, paddingBottom: 8 }}>
        <Text variant="title">{i18n.t("words.title")}</Text>
        <Text variant="body" color="muted" style={{ marginTop: 4 }}>
          {i18n.t("words.sub")}
        </Text>
      </View>

      <Card style={{ marginBottom: 16 }}>
        <Text variant="subtitle" style={{ marginBottom: 4 }}>
          {i18n.t("words.title")}
        </Text>
        <Text variant="caption" color="muted" style={{ marginBottom: 12 }}>
          {i18n.t("words.emergencyRule")}
        </Text>
        {emergency.map((w, i) => (
          <View key={i}>
            <SafetyWordField label={i18n.t("words.emergencyLabel", { n: i + 1 })} value={w} onChangeText={(v) => setWord(i, v)} showStrength testID={`emergency-word-${i}`} />
            {emergency.length > 1 ? (
              <Pressable
                testID={`emergency-remove-${i}`}
                accessibilityRole="button"
                accessibilityLabel={i18n.t("words.removeWord")}
                onPress={() => removeWord(i)}
                hitSlop={8}
                style={{ minHeight: 48, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 4, marginBottom: 8 }}
              >
                <Text variant="bodyStrong" color={p.stateDanger}>
                  {i18n.t("words.removeWord")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {emergency.length < MAX_EMERGENCY ? (
          <Button3D testID="emergency-add" variant="ghost" label={i18n.t("words.addWord")} onPress={addWord} />
        ) : null}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Text variant="subtitle" style={{ marginBottom: 4 }}>
          {i18n.t("words.policeTitle")}
        </Text>
        <Text variant="caption" color="muted" style={{ marginBottom: 12 }}>
          {i18n.t("words.policeSub")}
        </Text>
        <SafetyWordField label={i18n.t("words.policeLabel")} value={police} onChangeText={setPolice} showStrength testID="police-keyword" />
      </Card>

      <Text variant="caption" color="muted" style={{ marginBottom: 16 }}>
        {i18n.t("words.areYouSafeNote")}
      </Text>

      {saveErr ? (
        <Text variant="caption" color={p.stateDanger} style={{ marginBottom: 8 }}>
          {saveErr}
        </Text>
      ) : null}

      <Button3D testID="words-save" full label={i18n.t("words.save")} onPress={save} disabled={!canSave} loading={busy} />
    </Screen>
  );
}
