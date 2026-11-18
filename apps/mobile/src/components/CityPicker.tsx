import { useEffect, useRef, useState } from "react";
import { View, Pressable, Modal, ScrollView } from "react-native";
import { Crosshair, ChevronDown, Check } from "lucide-react-native";
import * as Location from "expo-location";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Chip } from "./Chip";
import { IconButton } from "./IconButton";
import { CITY_OPTIONS, cityFromCoords, type CityKey } from "../lib/cities";
import { supabase } from "../lib/supabase";
import i18n from "../i18n";

type DetectState = "idle" | "loading" | "done" | "error" | "denied";
type RegionRow = { status?: string };

// Journey-setup city selector. A select-style sheet drives `value`; the
// crosshair auto-detects the city from a one-shot GPS fix (expo-location); an
// amber chip summarises the unsafe-zone data around the chosen city via the
// regions_near RPC (Task 22). Presentational only — no timers, no protocol.
export function CityPicker({
  value,
  onChange,
  onDetected,
}: {
  value: CityKey;
  onChange: (city: CityKey) => void;
  onDetected?: (city: CityKey, label: string) => void;
}) {
  const { p, d } = useTheme();
  const [open, setOpen] = useState(false);
  const [detect, setDetect] = useState<DetectState>("idle");
  const [detectedLabel, setDetectedLabel] = useState<string | null>(null);
  const [zones, setZones] = useState<{ n: number; r: number } | null>(null);
  // Tracks mount so the async detect handler does not setState after unmount.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const selected = CITY_OPTIONS.find((c) => c.value === value) ?? null;

  // Regions summary for the amber chip. Runs when the selected city changes;
  // skipped for "other" (no real centre). Failures leave the chip hidden rather
  // than surfacing a raw error in the setup flow.
  useEffect(() => {
    let alive = true;
    if (!selected || selected.value === "other") {
      setZones(null);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc("regions_near", {
          lat: selected.lat,
          lng: selected.lng,
          radius_m: 15000,
        });
        if (!alive) return;
        if (error || !Array.isArray(data)) {
          setZones(null);
          return;
        }
        const rows = data as RegionRow[];
        const unsafe = rows.filter((x) => x.status === "amber" || x.status === "red");
        setZones(unsafe.length ? { n: unsafe.length, r: unsafe.filter((x) => x.status === "red").length } : null);
      } catch {
        if (alive) setZones(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selected]);

  async function runDetect() {
    setDetect("loading");
    setDetectedLabel(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!alive.current) return;
      if (perm.status !== "granted") {
        setDetect("denied");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      if (!alive.current) return;
      const key = cityFromCoords(pos.coords.latitude, pos.coords.longitude);
      const opt = CITY_OPTIONS.find((c) => c.value === key)!;
      onChange(key);
      onDetected?.(key, opt.label);
      setDetectedLabel(opt.label);
      setDetect("done");
    } catch {
      if (alive.current) setDetect("error");
    }
  }

  const message =
    detect === "loading"
      ? i18n.t("cityPicker.detecting")
      : detect === "done"
        ? i18n.t("cityPicker.detected", { label: detectedLabel ?? "" })
        : detect === "error"
          ? i18n.t("cityPicker.detectError")
          : detect === "denied"
            ? i18n.t("cityPicker.detectDenied")
            : null;

  return (
    <View style={{ gap: 10, alignSelf: "stretch" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          testID="citypicker-select"
          accessibilityRole="button"
          accessibilityLabel={i18n.t("cityPicker.selectA11y")}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(true)}
          style={{
            flex: 1,
            minHeight: 52,
            paddingHorizontal: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            borderRadius: 14,
            backgroundColor: d.input.bg,
            borderWidth: 1,
            borderColor: d.input.border,
          }}
        >
          <Text variant="body" color={selected ? "primary" : d.input.placeholder}>
            {selected ? selected.label : i18n.t("cityPicker.selectLabel")}
          </Text>
          <ChevronDown size={20} color={p.textMuted} strokeWidth={2} />
        </Pressable>
        <IconButton
          icon={Crosshair}
          onPress={runDetect}
          label={i18n.t("cityPicker.detect")}
          testID="citypicker-detect"
          size={52}
          disabled={detect === "loading"}
        />
      </View>

      {message ? (
        <Text testID="citypicker-message" variant="caption" color="muted">
          {message}
        </Text>
      ) : null}

      {zones ? (
        <Chip
          testID="citypicker-zones"
          kind="amber"
          label={i18n.t("cityPicker.zones", { n: zones.n, r: zones.r })}
        />
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          testID="citypicker-backdrop"
          accessibilityRole="button"
          accessibilityLabel={i18n.t("cityPicker.close")}
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
        >
          <Pressable
            testID="citypicker-sheet"
            onPress={() => {}}
            style={{ backgroundColor: d.card.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 12, maxHeight: "70%" }}
          >
            <Text variant="label" color="faint" style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
              {i18n.t("cityPicker.selectA11y")}
            </Text>
            <ScrollView>
              {CITY_OPTIONS.map((c) => {
                const active = c.value === value;
                return (
                  <Pressable
                    key={c.value}
                    testID={`citypicker-option-${c.value}`}
                    accessibilityRole="button"
                    accessibilityLabel={c.label}
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      onChange(c.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      minHeight: 52,
                      paddingHorizontal: 20,
                      backgroundColor: pressed ? p.brandSoft : "transparent",
                    })}
                  >
                    <Text variant="body" color="primary">
                      {c.label}
                    </Text>
                    {active ? <Check size={18} color={p.brand} strokeWidth={2.4} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
