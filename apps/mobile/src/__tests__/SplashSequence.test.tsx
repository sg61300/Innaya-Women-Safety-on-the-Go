import { render, act } from "@testing-library/react-native";
import { SplashSequence } from "../components/SplashSequence";

// render() is async in this project (RTL 14 / React 19 concurrent) — see the
// note in Button3D.test.tsx; awaited, otherwise the queries are still a Promise.
jest.useFakeTimers();

test("advances frames and calls onDone at 3.6 s", async () => {
  const onDone = jest.fn();
  const { getByTestId } = await render(<SplashSequence onDone={onDone} />);
  expect(getByTestId("splash-frame-0").props.style.opacity).toBe(1);
  await act(async () => { jest.advanceTimersByTime(1600); });
  expect(getByTestId("splash-frame-4").props.style.opacity).toBe(1);
  expect(getByTestId("splash-frame-0").props.style.opacity).toBe(0);
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(onDone).toHaveBeenCalledTimes(1);
});

test("reduce motion shows the final frame and finishes in 1.2 s", async () => {
  const onDone = jest.fn();
  const { getByTestId } = await render(<SplashSequence onDone={onDone} reduceMotion />);
  expect(getByTestId("splash-frame-4").props.style.opacity).toBe(1);
  await act(async () => { jest.advanceTimersByTime(1200); });
  expect(onDone).toHaveBeenCalled();
});
