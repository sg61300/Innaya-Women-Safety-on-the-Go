import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, Dimensions, findNodeHandle, type StyleProp, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TOUR_STEPS } from "./steps";

export type TourRect = { x: number; y: number; w: number; h: number };
type Scroller = { scrollTo: (o: { y: number; animated?: boolean }) => void };

type TourContext = {
  active: boolean;
  index: number;
  rect: TourRect | null;
  start: () => void;
  next: () => void;
  prev: () => void;
  close: () => void;
  registerTarget: (id: string, ref: React.RefObject<View | null>) => void;
  registerScroller: (route: string, ref: React.RefObject<Scroller | null>) => void;
  // The targetId of the current step, so a TourTarget can re-measure itself when
  // it (re)lays out while it is the active step (F6: keep the spotlight on it).
  activeTargetId: string | null;
  remeasure: () => void;
};

const Ctx = createContext<TourContext | null>(null);

// Registry-driven spotlight tour. Targets register their measured refs; the
// provider drives navigation + measurement, the overlay draws the veil/card.
export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const targets = useRef(new Map<string, React.RefObject<View | null>>());
  const scrollers = useRef(new Map<string, React.RefObject<Scroller | null>>());
  const indexRef = useRef(0);
  const scrolledFor = useRef<number>(-1); // step we have already auto-scrolled, so we scroll once
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<TourRect | null>(null);

  // F6: if the step's target sits outside the comfortable viewport band, scroll
  // its screen so it comes into view before the spotlight settles on it.
  const scrollIntoView = useCallback((i: number, node: View) => {
    if (scrolledFor.current === i) return; // once per step
    const scroller = scrollers.current.get(TOUR_STEPS[i].route)?.current;
    const handle = scroller ? findNodeHandle(scroller as unknown as number | React.Component) : null;
    if (!scroller || handle == null || typeof node.measureLayout !== "function") return;
    scrolledFor.current = i;
    node.measureLayout(
      handle,
      (_x: number, y: number) => { try { scroller.scrollTo({ y: Math.max(0, y - 96), animated: true }); } catch { /* best effort */ } },
      () => {}
    );
  }, []);

  // Screens mount a frame or two after navigation, so retry measureInWindow
  // every 100 ms up to 10× until the target has a non-zero box. F6: once a box is
  // known, scroll it into view if it is off-screen, then keep the spotlight on it.
  const measure = useCallback((i: number, attempt = 0) => {
    const step = TOUR_STEPS[i];
    const node = targets.current.get(step.targetId)?.current;
    if (node && typeof node.measureInWindow === "function") {
      node.measureInWindow((x, y, w, h) => {
        if (w > 0 || h > 0) {
          const { height } = Dimensions.get("window");
          // Only scroll when the box is actually clipped by the viewport: above
          // the top edge, or its bottom past the usable area (footer reserved).
          // height <= 0 means the viewport is unknown (e.g. under jsdom): treat as
          // on-screen so the spotlight still settles.
          const offscreen = height > 0 && (y < 0 || y + h > height - 120);
          if (offscreen && attempt < 8) {
            scrollIntoView(i, node);
            setTimeout(() => measure(i, attempt + 1), 120); // re-measure after the scroll
            return;
          }
          setRect({ x, y, w, h });
        } else if (attempt < 10) setTimeout(() => measure(i, attempt + 1), 100);
        else setRect(null);
      });
    } else if (attempt < 10) {
      setTimeout(() => measure(i, attempt + 1), 100);
    } else {
      setRect(null);
    }
  }, [scrollIntoView]);

  const goto = useCallback((to: number) => {
    const clamped = Math.max(0, Math.min(to, TOUR_STEPS.length - 1));
    const fromRoute = TOUR_STEPS[indexRef.current].route;
    const toRoute = TOUR_STEPS[clamped].route;
    // navigate (not push): reuses a route already in the stack instead of
    // stacking a new screen each step, so Back after "Done" returns to the
    // pre-tour screen rather than unwinding all 11 steps (B2).
    if (toRoute !== fromRoute) router.navigate(toRoute as never);
    indexRef.current = clamped;
    scrolledFor.current = -1;
    setIndex(clamped);
    setRect(null);
    measure(clamped);
  }, [router, measure]);

  const start = useCallback(() => {
    indexRef.current = 0;
    scrolledFor.current = -1;
    router.navigate(TOUR_STEPS[0].route as never);
    setActive(true);
    setIndex(0);
    setRect(null);
    measure(0);
    console.log("[tour] start");
  }, [router, measure]);

  const next = useCallback(() => goto(indexRef.current + 1), [goto]);
  const prev = useCallback(() => goto(indexRef.current - 1), [goto]);
  // F6: re-measure the current step's target (called from a TourTarget's onLayout
  // when it is the active step, so the spotlight tracks a late/re-sized box).
  const remeasure = useCallback(() => { if (active) measure(indexRef.current); }, [active, measure]);

  const close = useCallback(() => {
    setActive(false);
    AsyncStorage.setItem("vaira.tourSeen", "1").catch((e) => console.warn("[tour] persist failed", e));
    console.log("[tour] closed at", indexRef.current);
  }, []);

  const registerTarget = useCallback((id: string, ref: React.RefObject<View | null>) => {
    targets.current.set(id, ref);
  }, []);
  const registerScroller = useCallback((route: string, ref: React.RefObject<Scroller | null>) => {
    scrollers.current.set(route, ref);
  }, []);

  const activeTargetId = active ? TOUR_STEPS[index]?.targetId ?? null : null;

  return (
    <Ctx.Provider value={{ active, index, rect, start, next, prev, close, registerTarget, registerScroller, activeTargetId, remeasure }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTour(): TourContext {
  const t = useContext(Ctx);
  if (!t) throw new Error("useTour outside TourProvider");
  return t;
}

// Wraps a step target so the overlay can measure it. collapsable={false} keeps
// the native view alive on Android even when it has no background of its own.
export function TourTarget({ id, children, style, testID }: { id: string; children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { registerTarget, activeTargetId, remeasure } = useTour();
  const ref = useRef<View>(null);
  useEffect(() => {
    registerTarget(id, ref);
  }, [id, registerTarget]);
  return (
    <View
      ref={ref}
      testID={testID}
      collapsable={false}
      style={style}
      // F6: when this target is the active step, a (re)layout means the spotlight
      // must move/resize to it. onLayout also fires as it scrolls into view.
      onLayout={activeTargetId === id ? () => remeasure() : undefined}
    >
      {children}
    </View>
  );
}

// F6: a screen registers its scroll view so the tour can scroll an off-screen
// target into view. Call once with the route this screen serves and the ref.
export function useTourScroller(route: string, ref: React.RefObject<Scroller | null>) {
  const { registerScroller } = useTour();
  useEffect(() => { registerScroller(route, ref); }, [route, ref, registerScroller]);
}
