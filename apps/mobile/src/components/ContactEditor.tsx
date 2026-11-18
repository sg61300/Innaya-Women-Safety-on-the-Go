import { View, Pressable } from "react-native";
import * as Contacts from "expo-contacts";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Field } from "./Field";
import { Button3D } from "./Button3D";
import i18n from "../i18n";

export type EditableContact = { name: string; phone: string; email: string; tier: "primary" | "buffer" };

const MAX_PRIMARY = 10;
const MAX_BUFFER = 5;

// Strip formatting and a leading +91/91 country code so a picked number matches
// the 10-digit Indian-mobile validator.
function tidyPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.replace(/^91(?=\d{10}$)/, "");
}

export function ContactEditor({
  contacts,
  onChange,
}: {
  contacts: EditableContact[];
  onChange: (next: EditableContact[]) => void;
}) {
  const { p, d } = useTheme();
  const primaryCount = contacts.filter((c) => c.tier === "primary").length;
  const bufferCount = contacts.filter((c) => c.tier === "buffer").length;

  function set(i: number, patch: Partial<EditableContact>) {
    onChange(contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }
  function remove(i: number) {
    onChange(contacts.filter((_, j) => j !== i));
  }
  function addManual() {
    onChange([...contacts, { name: "", phone: "", email: "", tier: "primary" }]);
  }
  async function addFromContacts() {
    try {
      const perm = await Contacts.requestPermissionsAsync();
      if (!perm.granted) return;
      const picked = await Contacts.Contact.presentPicker();
      if (!picked) return;
      const [phones, given, family] = await Promise.all([picked.getPhones(), picked.getGivenName(), picked.getFamilyName()]);
      const name = [given, family].filter(Boolean).join(" ").trim();
      const phone = tidyPhone(phones?.[0]?.number ?? "");
      onChange([...contacts, { name, phone, email: "", tier: "primary" }]);
    } catch (e) {
      console.warn("[contacts] import failed", (e as Error).message);
    }
  }

  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Text variant="caption" color="muted">
          {i18n.t("profile.primaryCount", { n: primaryCount, max: MAX_PRIMARY })}
        </Text>
        <Text variant="caption" color="muted">
          {i18n.t("profile.bufferCount", { n: bufferCount, max: MAX_BUFFER })}
        </Text>
      </View>

      {contacts.map((c, i) => (
        <View
          key={i}
          testID={`contact-row-${i}`}
          style={{ marginBottom: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: d.card.border, backgroundColor: d.card.bg }}
        >
          <Field label={i18n.t("profile.contactName")} value={c.name} onChangeText={(v) => set(i, { name: v })} autoCapitalize="words" testID={`contact-name-${i}`} />
          <Field
            label={i18n.t("profile.contactPhone")}
            value={c.phone}
            onChangeText={(v) => set(i, { phone: v.replace(/\D/g, "").slice(0, 10) })}
            keyboardType="phone-pad"
            maxLength={10}
            testID={`contact-phone-${i}`}
          />
          <Field
            label={i18n.t("profile.contactEmail")}
            value={c.email}
            onChangeText={(v) => set(i, { email: v.trim() })}
            keyboardType="email-address"
            testID={`contact-email-${i}`}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {(["primary", "buffer"] as const).map((tier) => {
              const on = c.tier === tier;
              return (
                <Pressable
                  key={tier}
                  testID={`contact-tier-${tier}-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={i18n.t(tier === "primary" ? "profile.tierPrimary" : "profile.tierBuffer")}
                  accessibilityState={{ selected: on }}
                  onPress={() => set(i, { tier })}
                  hitSlop={8}
                  style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? d.chip.brand.bg : "transparent", borderWidth: 1, borderColor: on ? p.brand : d.card.border }}
                >
                  <Text variant="chip" color={on ? d.chip.brand.fg : "muted"}>
                    {i18n.t(tier === "primary" ? "profile.tierPrimary" : "profile.tierBuffer")}
                  </Text>
                </Pressable>
              );
            })}
            <View style={{ flex: 1 }} />
            <Pressable
              testID={`contact-remove-${i}`}
              accessibilityRole="button"
              accessibilityLabel={i18n.t("profile.removeContact")}
              onPress={() => remove(i)}
              hitSlop={8}
              style={{ minHeight: 48, minWidth: 48, alignItems: "center", justifyContent: "center" }}
            >
              <Text variant="bodyStrong" color={p.stateDanger}>
                {i18n.t("profile.removeContact")}
              </Text>
            </Pressable>
          </View>
        </View>
      ))}

      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <Button3D testID="contact-add-manual" variant="ghost" label={i18n.t("profile.addManual")} onPress={addManual} />
        <Button3D testID="contact-add-device" variant="ghost" label={i18n.t("profile.addFromContacts")} onPress={addFromContacts} />
      </View>
    </View>
  );
}
