import { type ReactNode } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform, type ScrollViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useTheme } from "../theme";

// F2: screens rendered UNDER a layout-level <AppHeader/> (the authenticated user
// and guardian groups) pass topInset={false} so the header owns the top safe area
// and the screen does not add a second one (which showed as a blank band). Auth
// and setup screens keep the top edge — they have no layout header.
//
// X1 (s25): Expo SDK 57 / RN 0.86 render Android edge-to-edge, so the window no
// longer resizes for the soft keyboard (`adjustResize` is a no-op) and a focused
// input sat under the keyboard on every screen. The body now goes through ONE
// KeyboardAvoidingView here (behavior "height" on Android / "padding" on iOS,
// matching EmergencyOverlay), so the scroll viewport shrinks above the keyboard
// and every field is reachable. Fixed once in the wrapper, not per screen.
//
// X3 (s25): an optional `header` slot renders a fixed element (logo / Back /
// title) OUTSIDE the scroll container — inside the SafeAreaView, above the body —
// so it stays put while the content scrolls.
export function Screen({
  children,
  scroll,
  padded,
  testID,
  topInset = true,
  header,
  scrollProps,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  testID?: string;
  topInset?: boolean;
  header?: ReactNode;
  // X2a (s25): consent forwards onScroll/onContentSizeChange/onLayout here so it
  // can enable its "read and agree" checkbox only once the text is scrolled to
  // the end (or immediately when the content already fits without scrolling).
  scrollProps?: Pick<ScrollViewProps, "onScroll" | "onContentSizeChange" | "onLayout" | "scrollEventThrottle">;
}) {
  const { p } = useTheme();
  const pad = padded ? 16 : 0;
  const edges: Edge[] = topInset ? ["top", "right", "bottom", "left"] : ["right", "bottom", "left"];
  return (
    <SafeAreaView testID={testID} edges={edges} style={{ flex: 1, backgroundColor: p.bgBase }}>
      {header != null ? (
        <View testID="screen-header" style={{ paddingHorizontal: pad }}>
          {header}
        </View>
      ) : null}
      <KeyboardAvoidingView
        testID="screen-kav"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {scroll ? (
          <ScrollView
            testID={testID ? `${testID}-sv` : undefined}
            contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: pad }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            {...scrollProps}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, paddingHorizontal: pad }}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
