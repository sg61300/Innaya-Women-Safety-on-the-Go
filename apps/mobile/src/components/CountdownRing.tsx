import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../theme";
import { Text } from "./Text";
import i18n from "../i18n";

// Static progress ring: the arc is a pure function of seconds/total, redrawn
// when the parent ticks `seconds`. No internal animation, so reduce-motion
// needs no branch (there is no spin to disable).
export function CountdownRing({
  seconds,
  total,
  urgentAt = 2,
  size = 150,
}: {
  seconds: number;
  total: number;
  urgentAt?: number;
  size?: number;
}) {
  const { p, d } = useTheme();
  const urgent = seconds <= urgentAt;
  const numeralColor = urgent ? d.sos : d.chip.brand.fg;
  const strokeColor = urgent ? d.sos : p.brand;

  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const progress = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0;
  const cx = size / 2;

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${seconds} seconds`}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={cx} cy={cx} r={r} stroke={p.border} strokeWidth={8} fill="none" />
        <Circle
          testID="countdownring-progress"
          cx={cx}
          cy={cx}
          r={r}
          stroke={strokeColor}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * progress} ${c}`}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </Svg>
      <Text variant="numeral" color={numeralColor}>
        {seconds}
      </Text>
      <Text variant="label" color={p.textMuted}>
        {i18n.t("countdown.caption")}
      </Text>
    </View>
  );
}

// Task V8 keeps the Task 27 name as an alias of the same component.
export const CountdownNumeral = CountdownRing;
