import { useEffect, useRef } from "react";
import { Pressable } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";
import { TourProvider, useTour } from "../components/tour/TourProvider";
import { TOUR_STEPS } from "../components/tour/steps";

// expo-router is a runtime module; stub the router so we can see which
// navigation method the tour uses. AsyncStorage is mocked globally (jest.setup).
const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, navigate: mockNavigate, replace: jest.fn() }) }));

// Harness registers a resolvable target (keeps measure() synchronous, no retry
// timer leak) and exposes start() through a pressable — the same render +
// fireEvent shape the FooterNav test uses to settle under the concurrent root.
function Harness() {
  const { start, registerTarget } = useTour();
  const ref = useRef({ measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 0, 10, 10) });
  useEffect(() => { registerTarget(TOUR_STEPS[0].targetId, ref as never); }, [registerTarget]);
  return <Pressable testID="go" onPress={start} />;
}

// B2: the tour must navigate() between step routes, not push(). push() stacks a
// fresh screen per route change, so Back after "Done" unwinds all 12 steps;
// navigate() reuses the route already in the stack and keeps Back at the
// pre-tour screen. Asserting navigate() is called and push() is not locks that.
test("start navigates (not push) so Back returns to the pre-tour screen (B2)", async () => {
  const { getByTestId } = await render(<TourProvider><Harness /></TourProvider>);
  fireEvent.press(getByTestId("go"));
  expect(mockNavigate).toHaveBeenCalledWith(TOUR_STEPS[0].route);
  expect(mockPush).not.toHaveBeenCalled();
});

// F6: the spotlight must resize/move to the active target. A re-measure (fired by
// the target's onLayout when it lays out or its box changes) updates the rect.
function ReHarness() {
  const { start, next, registerTarget, remeasure, rect } = useTour();
  const box = useRef({ x: 0, y: 10, w: 10, h: 10 });
  const ref = useRef({ measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(box.current.x, box.current.y, box.current.w, box.current.h) });
  useEffect(() => {
    TOUR_STEPS.forEach((s) => registerTarget(s.targetId, ref as never)); // same node for every step
  }, [registerTarget]);
  return (
    <>
      <Pressable testID="go" onPress={start} />
      <Pressable testID="grow" onPress={() => { box.current = { x: 5, y: 220, w: 60, h: 80 }; remeasure(); }} />
      <Pressable testID="next" onPress={next} />
      <Pressable testID="rect" accessibilityLabel={rect ? `${rect.w}x${rect.h}@${rect.y}` : "none"} />
    </>
  );
}

test("F6: remeasure moves and resizes the spotlight to the target's new box", async () => {
  const { getByTestId } = await render(<TourProvider><ReHarness /></TourProvider>);
  await act(async () => { fireEvent.press(getByTestId("go")); });
  expect(getByTestId("rect").props.accessibilityLabel).toBe("10x10@10");
  await act(async () => { fireEvent.press(getByTestId("grow")); });
  expect(getByTestId("rect").props.accessibilityLabel).toBe("60x80@220");
});
