import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useNavigation } from "expo-router";

// Live OS "reduce motion" flag. Read once on mount and track changes, mirroring
// the proven pattern in app/(user)/home.tsx. Defaults to false so motion is the
// normal case; a true reading pins every driven value to its rest/still state.
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => { if (alive) setReduce(on); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (on: boolean) => setReduce(on));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduce;
}

// True only while THIS screen is the focused tab (so animations stop when the
// screen is not visible) and the user has not asked the OS to reduce motion.
// Uses expo-router's navigation focus/blur events — the same navigation object
// the screen tests already mock — so it stays green in jest and pauses motion on
// unfocused tabs on device. Defaults to focused=true so a screen with no emitter
// (and the first paint before any event) still animates.
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  // useNavigation throws when there is no navigator in the tree (isolated jest
  // screen renders). On device a navigator is always present; without one we
  // simply treat the screen as focused (motion stays gated by reduce-motion).
  // expo-router types useNavigation() as {} without a param list, so name only the
  // two focus events this hook needs (fixes TS2339 on addListener).
  type FocusEmitter = { addListener: (event: "focus" | "blur", cb: () => void) => () => void };
  let nav: FocusEmitter | null = null;
  try { nav = useNavigation() as unknown as FocusEmitter; } catch { nav = null; }
  useEffect(() => {
    if (!nav) return;
    const subFocus = nav.addListener("focus", () => setFocused(true));
    const subBlur = nav.addListener("blur", () => setFocused(false));
    return () => { subFocus?.(); subBlur?.(); };
  }, [nav]);
  return focused;
}

export function useMotionActive(): boolean {
  const focused = useScreenFocused();
  const reduce = useReduceMotion();
  return focused && !reduce;
}
