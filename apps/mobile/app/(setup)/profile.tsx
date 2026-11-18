import { useEffect, useRef, useState } from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { profileSchema } from "@vaira/core";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Card } from "../../src/components/Card";
import { Field } from "../../src/components/Field";
import { Button3D } from "../../src/components/Button3D";
import { VoiceFabWithSTT } from "../../src/components/VoiceFabWithSTT";
import { FAB_INSET } from "../../src/components/VoiceFab";
import { ContactEditor, type EditableContact } from "../../src/components/ContactEditor";
import { saveProfile } from "../../src/services/profile";
import { supabase } from "../../src/lib/supabase";
import { useTheme } from "../../src/theme";
import i18n from "../../src/i18n";

const OCCUPATIONS = ["Working professional", "Self-employed", "Business", "Student", "Other"] as const;
const TOOLS = ["Pepper spray", "Personal alarm", "Whistle", "Safety app"] as const;
const DRAFT_KEY = "vaira.profile.draft";

type Draft = {
  name: string;
  age: string;
  occupation: string;
  company: string;
  howHeard: string;
  contacts: EditableContact[];
  trained: "yes" | "no" | null;
  discipline: string;
  level: string;
  duration: string;
  tools: string[];
};

const EMPTY: Draft = { name: "", age: "", occupation: "", company: "", howHeard: "", contacts: [], trained: null, discipline: "", level: "", duration: "", tools: [] };

export default function Profile() {
  const { p, d } = useTheme();
  const [form, setForm] = useState<Draft>(EMPTY);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const loaded = useRef(false);
  const dirty = useRef(false);

  // Restore any autosaved draft once, then persist on every change.
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY)
      .then((v) => {
        // D4: getItem resolves asynchronously. If it lands after the user has
        // already started typing, applying it clobbers their input — so restore
        // the draft only while the form is still pristine.
        if (v && !dirty.current) setForm({ ...EMPTY, ...JSON.parse(v) });
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
      });
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    // D4: never persist a contact row that is still completely empty (no name AND
    // no phone); it would restore as a blank row on the next launch.
    const toPersist = { ...form, contacts: form.contacts.filter((c) => c.name.trim() || c.phone.trim()) };
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(toPersist)).catch(() => {});
  }, [form]);

  const patch = (k: keyof Draft, v: unknown) => {
    dirty.current = true;
    setForm((f) => ({ ...f, [k]: v }));
    // R5: errors are set only in save(); without this they linger after the
    // value is corrected. Drop the error for this field (and, for the contacts
    // list, every row-level "contacts.<i>.<field>" key) as soon as it changes.
    setErrors((e) => {
      if (!Object.keys(e).length) return e;
      const next = { ...e };
      let changed = false;
      for (const ek of Object.keys(next)) {
        if (ek === k || ek === String(k) || ek.startsWith(`${k}.`)) {
          delete next[ek];
          changed = true;
        }
      }
      return changed ? next : e;
    });
  };

  // Next empty text field, so the voice FAB speaks the right prompt and fills it.
  const nextEmpty = !form.name.trim() ? "name" : !form.age.trim() ? "age" : null;
  function onVoiceText(text: string) {
    if (nextEmpty === "name") patch("name", text.trim());
    else if (nextEmpty === "age") {
      const n = parseInt(text.replace(/\D/g, ""), 10);
      if (!Number.isNaN(n)) patch("age", String(n));
    }
  }

  function toInput() {
    return {
      name: form.name.trim(),
      age: parseInt(form.age, 10),
      occupation: form.occupation,
      company: form.company.trim() || undefined,
      howHeard: form.howHeard.trim() || undefined,
      selfDefence:
        form.trained === null
          ? undefined
          : form.trained === "yes"
            ? { trained: true, discipline: form.discipline.trim() || undefined, level: form.level.trim() || undefined, duration: form.duration.trim() || undefined }
            : { trained: false },
      tools: form.tools.length ? form.tools : undefined,
      contacts: form.contacts.map((c) => ({ name: c.name.trim(), phone: c.phone, email: c.email, tier: c.tier })),
    };
  }

  const toggleTool = (t: string) => patch("tools", form.tools.includes(t) ? form.tools.filter((x) => x !== t) : [...form.tools, t]);

  // D5: contact issues are keyed "contacts" (list-level) and "contacts.<i>.<field>"
  // (row-level). The row-level ones were never rendered, so an invalid contact
  // silently blocked Save. Surface every contact error under the contacts card.
  const contactErrors = Object.keys(errors)
    .filter((k) => k === "contacts" || k.startsWith("contacts."))
    .map((k) => errors[k]);

  async function pickPhoto(fromCamera: boolean) {
    try {
      const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
      if (!res.canceled && res.assets[0]?.uri) setPhotoUri(res.assets[0].uri);
    } catch (e) {
      console.warn("[profile] photo pick failed", (e as Error).message);
    }
  }

  async function uploadPhoto(userId: string) {
    if (!photoUri) return;
    try {
      const resp = await fetch(photoUri);
      const blob = await resp.arrayBuffer();
      const path = `${userId}/profile.jpg`;
      const { error } = await supabase.storage.from("selfies").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      await supabase.from("profiles").update({ photo_url: path }).eq("id", userId);
    } catch (e) {
      console.warn("[profile] photo upload skipped", (e as Error).message);
    }
  }

  async function save() {
    if (busy) return;
    setSaveErr(null);
    const parsed = profileSchema.safeParse(toInput());
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "form";
        // D6: don't leak raw zod copy for the two fields that produced it.
        if (key === "occupation") map[key] = i18n.t("profile.errOccupation");
        else if (key === "age") map[key] = form.age.trim() === "" ? i18n.t("profile.errAgeRequired") : i18n.t("profile.errAgeNumber");
        else map[key] = issue.message;
      }
      setErrors(map);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) throw new Error("no-session");
      // Owner 2026-11-11: her own number is never one of her guardians. The database refuses it
      // too (migration 0035); a failed read here leaves that check to the database.
      const own = await supabase.from("profiles").select("phone").eq("id", userId).maybeSingle().then((r) => (r.data as { phone?: string | null } | null)?.phone ?? null, () => null);
      if (own && parsed.data.contacts.some((c) => c.phone === own)) {
        setErrors({ contacts: i18n.t("profile.errOwnNumber") });
        return;
      }
      // Owner 2026-11-12: her own email is never a guardian's email either.
      const ownEmail = data.user?.email?.trim().toLowerCase();
      if (ownEmail && parsed.data.contacts.some((x) => x.email?.trim().toLowerCase() === ownEmail)) {
        setErrors({ contacts: i18n.t("profile.errOwnEmail") });
        return;
      }
      await saveProfile(userId, parsed.data);
      await uploadPhoto(userId);
      await AsyncStorage.removeItem(DRAFT_KEY);
      router.replace("/(setup)/safety-words");
    } catch (e) {
      setSaveErr(i18n.t("profile.saveError"));
      console.warn("[profile] save failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      scroll
      padded
      testID="profile-screen"
      header={
        // X3 (s25): the title/subtitle stay fixed while the form fields scroll.
        <View style={{ paddingTop: 24, paddingBottom: 8 }}>
          <Text variant="title">{i18n.t("profile.title")}</Text>
          <Text variant="body" color="muted" style={{ marginTop: 4 }}>
            {i18n.t("profile.sub")}
          </Text>
        </View>
      }
    >

      <Card style={{ marginBottom: 16 }}>
        <Text variant="subtitle" style={{ marginBottom: 12 }}>
          {i18n.t("profile.aboutYou")}
        </Text>
        <Field label={i18n.t("profile.name")} value={form.name} onChangeText={(v) => patch("name", v)} placeholder={i18n.t("profile.namePlaceholder")} autoCapitalize="words" error={errors.name} testID="profile-name" />
        <Field
          label={i18n.t("profile.age")}
          value={form.age}
          onChangeText={(v) => patch("age", v.replace(/\D/g, "").slice(0, 3))}
          placeholder={i18n.t("profile.agePlaceholder")}
          keyboardType="number-pad"
          maxLength={3}
          error={errors.age}
          testID="profile-age"
        />
        <Text variant="label" color="muted" style={{ marginBottom: 6 }}>
          {i18n.t("profile.occupation")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {OCCUPATIONS.map((o) => {
            const on = form.occupation === o;
            return (
              <Pressable
                key={o}
                testID={`profile-occupation-${o}`}
                accessibilityRole="button"
                accessibilityLabel={o}
                accessibilityState={{ selected: on }}
                onPress={() => patch("occupation", o)}
                style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? d.chip.brand.bg : "transparent", borderWidth: 1, borderColor: on ? p.brand : d.card.border }}
              >
                <Text variant="bodyStrong" color={on ? d.chip.brand.fg : "muted"}>
                  {o}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {errors.occupation ? (
          <Text variant="caption" color={p.stateDanger} style={{ marginTop: 6 }}>
            {errors.occupation}
          </Text>
        ) : null}
      </Card>

      {/* R1: explain the guardian rota at the moment she names guardians. */}
      <Card variant="raised" style={{ marginBottom: 16 }} testID="guardian-care-card">
        <Text variant="subtitle" style={{ marginBottom: 10 }}>
          {i18n.t("guardianCare.title")}
        </Text>
        {(["guardianCare.p1", "guardianCare.p2", "guardianCare.p3", "guardianCare.p4", "guardianCare.p5"] as const).map((k) => (
          <View key={k} style={{ flexDirection: "row", marginBottom: 8 }}>
            <Text variant="body" color={p.brand} style={{ marginRight: 8 }}>
              •
            </Text>
            <Text variant="body" color="muted" style={{ flex: 1 }}>
              {i18n.t(k)}
            </Text>
          </View>
        ))}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Text variant="subtitle" style={{ marginBottom: 4 }}>
          {i18n.t("profile.contacts")}
        </Text>
        <Text variant="caption" color="muted" style={{ marginBottom: 12 }}>
          {i18n.t("profile.contactsHint")}
        </Text>
        <ContactEditor contacts={form.contacts} onChange={(next) => patch("contacts", next)} />
        {contactErrors.map((msg, idx) => (
          <Text key={idx} variant="caption" color={p.stateDanger} style={{ marginTop: 6 }} testID={`contact-error-${idx}`}>
            {msg}
          </Text>
        ))}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Text variant="subtitle" style={{ marginBottom: 4 }}>
          {i18n.t("profile.selfDefence")}
        </Text>
        <Text variant="caption" color="muted" style={{ marginBottom: 12 }}>
          {i18n.t("profile.selfDefenceQ")}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["yes", "no"] as const).map((v) => {
            const on = form.trained === v;
            return (
              <Pressable
                key={v}
                testID={`profile-trained-${v}`}
                accessibilityRole="button"
                accessibilityLabel={i18n.t(v === "yes" ? "profile.yes" : "profile.no")}
                accessibilityState={{ selected: on }}
                onPress={() => patch("trained", v)}
                style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, backgroundColor: on ? d.chip.brand.bg : "transparent", borderWidth: 1, borderColor: on ? p.brand : d.card.border }}
              >
                <Text variant="bodyStrong" color={on ? d.chip.brand.fg : "muted"}>
                  {i18n.t(v === "yes" ? "profile.yes" : "profile.no")}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {form.trained === "yes" ? (
          <View style={{ marginTop: 12 }}>
            <Field label={i18n.t("profile.discipline")} value={form.discipline} onChangeText={(v) => patch("discipline", v)} placeholder={i18n.t("profile.disciplinePlaceholder")} autoCapitalize="words" testID="profile-discipline" />
            <Field label={i18n.t("profile.level")} value={form.level} onChangeText={(v) => patch("level", v)} autoCapitalize="sentences" testID="profile-level" />
            <Field label={i18n.t("profile.duration")} value={form.duration} onChangeText={(v) => patch("duration", v)} placeholder={i18n.t("profile.durationPlaceholder")} autoCapitalize="sentences" testID="profile-duration" />
          </View>
        ) : null}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Text variant="subtitle" style={{ marginBottom: 4 }}>
          {i18n.t("profile.tools")}
        </Text>
        <Text variant="caption" color="muted" style={{ marginBottom: 12 }}>
          {i18n.t("profile.toolsHint")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {TOOLS.map((t) => {
            const on = form.tools.includes(t);
            return (
              <Pressable
                key={t}
                testID={`profile-tool-${t}`}
                accessibilityRole="button"
                accessibilityLabel={t}
                accessibilityState={{ selected: on }}
                onPress={() => toggleTool(t)}
                style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? d.chip.brand.bg : "transparent", borderWidth: 1, borderColor: on ? p.brand : d.card.border }}
              >
                <Text variant="bodyStrong" color={on ? d.chip.brand.fg : "muted"}>
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Text variant="subtitle" style={{ marginBottom: 8 }}>
          {i18n.t("profile.photo")}
        </Text>
        {photoUri ? (
          <Text variant="caption" color={p.stateSafe} style={{ marginBottom: 8 }}>
            {i18n.t("profile.photoAdded")}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <Button3D testID="profile-photo-camera" variant="ghost" label={i18n.t("profile.takePhoto")} onPress={() => pickPhoto(true)} />
          <Button3D testID="profile-photo-library" variant="ghost" label={i18n.t("profile.choosePhoto")} onPress={() => pickPhoto(false)} />
        </View>
      </Card>

      {/* F1: the survey is optional (howHeard maps to undefined when blank), so it
          is always shown with no Skip. The old Skip toggled a showSurvey flag; the
          field is simply left empty when the user does not want to answer. */}
      <Card style={{ marginBottom: 16 }}>
        <Text variant="subtitle" style={{ marginBottom: 8 }}>{i18n.t("profile.howHeard")}</Text>
        <Field label={i18n.t("profile.howHeardLabel")} value={form.howHeard} onChangeText={(v) => patch("howHeard", v)} placeholder={i18n.t("profile.howHeardPlaceholder")} autoCapitalize="sentences" testID="profile-how-heard" />
      </Card>

      {saveErr ? (
        <Text variant="caption" color={p.stateDanger} style={{ marginBottom: 8 }}>
          {saveErr}
        </Text>
      ) : null}

      <Button3D testID="profile-save" full label={i18n.t("profile.save")} onPress={save} loading={busy} />

      {/* D7: reserve bottom-right space so the floating mic FAB (positioned at
          bottom:96, 52dp tall) never overlaps the "Save and continue" CTA when
          the form is scrolled to the end. FAB_INSET is the shared single source. */}
      <View style={{ height: FAB_INSET }} testID="profile-fab-inset" />

      <VoiceFabWithSTT
        onText={onVoiceText}
        prompt={nextEmpty ? i18n.t(nextEmpty === "name" ? "profile.name" : "profile.age") : undefined}
      />
    </Screen>
  );
}
