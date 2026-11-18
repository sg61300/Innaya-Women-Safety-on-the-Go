import { useEffect, useState } from "react";
import { View, Pressable, Share } from "react-native";
import { useTheme } from "../theme";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { Text } from "./Text";
import { Illustration } from "./Illustration";
import { TourTarget } from "./tour/TourProvider";
import { supabase } from "../lib/supabase";
import i18n from "../i18n";

type Row = { id: string; name: string | null; phone: string; tier: string; linked_user_id: string | null };

// Initials for the avatar circle: first letters of up to two name words.
function initials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

// Task 34 — Guardians tab. Lists the owner's own contacts (Task 19 rows) as Card
// rows with initials avatar, an "app-linked" dot, and a Primary/Buffer chip. The
// dot marks guardians who have the app (a real linked_user_id) — not live
// presence, which the app does not track. TourTarget id="guardians" is the target
// for the intro tour step of the same id.
export function GuardiansTab({ userId }: { userId: string }) {
  const { p, d } = useTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("contacts")
          .select("id, name, phone, tier, linked_user_id")
          .eq("owner_id", userId)
          .order("tier")
          .order("position");
        if (alive) setRows((data as Row[]) ?? []);
      } catch {
        /* keep empty */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  // Share plain invite text only. A `vaira://invite?phone=` deep link was
  // removed: the `vaira` scheme is registered but no route handles `invite`, so
  // the link led guardians to an unmatched route. No app-invite entry point
  // exists on the mobile side yet (the only guardian-link is the journey-scoped
  // live-tracking web endpoint), so there is nothing valid to link to.
  const invite = (_phone: string) =>
    Share.share({ message: i18n.t("guardians.inviteBody") }).catch(() => {});

  return (
    <TourTarget id="guardians">
      <View style={{ gap: 12 }} testID="guardians-tab">
        {loading ? (
          <Card>
            <Text variant="body" color="muted">…</Text>
          </Card>
        ) : rows.length === 0 ? (
          <Card variant="raised" style={{ alignItems: "center", gap: 10 }}>
            <Illustration name="guardians" size={96} testID="guardians-empty-art" />
            <Text variant="body" color="muted" style={{ textAlign: "center" }}>{i18n.t("guardians.empty")}</Text>
          </Card>
        ) : (
          rows.map((r) => {
            const online = !!r.linked_user_id;
            return (
              <Card variant="raised" key={r.id} testID={`guardian-row-${r.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View
                    style={{
                      width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
                      backgroundColor: d.chip.brand.bg,
                    }}
                  >
                    <Text variant="bodyStrong" color={d.chip.brand.fg}>{initials(r.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View
                        testID={`guardian-dot-${r.id}`}
                        accessibilityLabel={online ? i18n.t("guardians.online") : i18n.t("guardians.offline")}
                        style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: online ? p.stateSafe : d.card.border }}
                      />
                      <Text variant="body">{r.name ?? r.phone}</Text>
                    </View>
                    <Text variant="caption" color="muted">{r.phone}</Text>
                  </View>
                  <Chip kind={r.tier === "primary" ? "brand" : "neutral"}
                    label={i18n.t(r.tier === "primary" ? "guardians.primary" : "guardians.buffer")} />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={i18n.t("guardians.invite")}
                  testID={`guardian-invite-${r.id}`}
                  onPress={() => invite(r.phone)}
                  style={{ minHeight: 44, justifyContent: "center", marginTop: 4 }}
                >
                  <Text variant="body" color={p.brand}>{i18n.t("guardians.invite")}</Text>
                </Pressable>
              </Card>
            );
          })
        )}
      </View>
    </TourTarget>
  );
}
