import { render } from "@testing-library/react-native";
import { Illustration, type IllustrationName } from "../components/Illustration";
import { ILLUSTRATION_FILES } from "../../assets/illustrations/illustrations.generated";

// F-illustrations: a slot with a file renders that file; a slot with no file
// still renders (emblem fallback). b14 landed the art, so the map is populated —
// the fallback branch is exercised with a key that is deliberately not in it.
test("renders the generated file when the key has one", async () => {
  expect(ILLUSTRATION_FILES["regions-empty"]).toBeDefined();
  const { getByTestId } = await render(<Illustration name="regions-empty" size={40} testID="art" />);
  expect(getByTestId("art").props.source).toBe(ILLUSTRATION_FILES["regions-empty"]);
});

test("renders the emblem fallback when the key has no file", async () => {
  const missing = "not-a-real-slot" as IllustrationName;
  expect((ILLUSTRATION_FILES as Record<string, unknown>)[missing]).toBeUndefined();
  const { getByTestId } = await render(<Illustration name={missing} size={40} testID="art" />);
  expect(getByTestId("art").props.source).toBeDefined();
});
