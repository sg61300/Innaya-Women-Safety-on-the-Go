import { useCallback, useEffect, type RefObject } from "react";
import type { ScrollView } from "react-native";
import { useFocusEffect, useNavigation } from "expo-router";

// F17 (founder live test 2026-09-07): switching tabs kept each tab's scroll
// offset, so returning to a tab showed a mid-page position. Scroll the tab's
// ScrollView back to the top whenever it gains focus.
//
// F17b (same test): re-tapping the already-active footer tab did nothing — users
// expect it to scroll the current list back to the top. The footer emits a
// react-navigation `tabPress` on every tap (active or not); we listen for it and
// scroll to top. For a screen nested inside a per-tab Stack (F16), `tabPress` is
// emitted on the parent tab navigator, so we attach to the navigation chain.
export function useScrollTopOnFocus(ref: RefObject<ScrollView | null>) {
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      ref.current?.scrollTo?.({ y: 0, animated: false });
      return undefined;
    }, [ref])
  );

  useEffect(() => {
    const scrollTop = () => ref.current?.scrollTo?.({ y: 0, animated: false });
    // Attach to this screen's navigator and, when it is nested in a Stack, to the
    // tab navigator above it — whichever one owns the `tabPress` event fires it.
    const unsubs: Array<() => void> = [];
    let nav: ReturnType<typeof useNavigation> | undefined = navigation;
    while (nav) {
      try {
        unsubs.push((nav as { addListener: (t: string, cb: () => void) => () => void }).addListener("tabPress", scrollTop));
      } catch { /* navigator without this event: ignore */ }
      nav = (nav as { getParent?: () => typeof nav }).getParent?.();
    }
    return () => { for (const u of unsubs) u(); };
  }, [navigation, ref]);
}
