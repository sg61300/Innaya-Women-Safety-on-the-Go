import { render, fireEvent } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { AreYouSafeLayout } from "../components/AreYouSafeLayout";

// Button3D fires haptics on press-in; stub the native module (see Button3D.test).
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" } }));

// render() commits asynchronously in this project (React 19 concurrent) — await
// it before querying (repo convention, see Text.test.tsx / StatusChip.test.tsx).
test("layout, buttons and no dismiss control", async () => {
  const onSafe = jest.fn(), onDanger = jest.fn(), onTyped = jest.fn();
  const { getByText, getByPlaceholderText, queryByLabelText } = await render(<ThemeProvider initial="violetBloom"><AreYouSafeLayout seconds={4} total={5} typed="" onTyped={onTyped} onSafe={onSafe} onDanger={onDanger} speakerPromptFired={false} /></ThemeProvider>);
  // Button3D animates on press (reanimated withTiming); let each interaction's
  // act() scope settle so they do not overlap (keeps the output pristine).
  const tick = () => new Promise((r) => setTimeout(r, 0));
  getByText("Are you safe?"); getByText("Say your safe word."); getByText("CHECK-IN REQUIRED");
  fireEvent.press(getByText("I'm in danger")); expect(onDanger).toHaveBeenCalled(); await tick();
  fireEvent.changeText(getByPlaceholderText("Type your safe word…"), "purple"); expect(onTyped).toHaveBeenCalledWith("purple"); await tick();
  fireEvent(getByPlaceholderText("Type your safe word…"), "submitEditing"); expect(onSafe).toHaveBeenCalled(); await tick();
  expect(queryByLabelText("Close")).toBeNull();
});
