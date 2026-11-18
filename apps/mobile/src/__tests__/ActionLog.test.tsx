import { render } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { ActionLog } from "../components/ActionLog";

// render() is async in this project (see src/__tests__/Text.test.tsx) — await it.
const wrap = (el: React.ReactElement) =>
  render(<ThemeProvider initial="midnight">{el}</ThemeProvider>);

test("renders labels, details and done/pending state", async () => {
  const { getByText, getAllByTestId } = await wrap(
    <ActionLog
      tone="onCritical"
      items={[
        { label: "Guardians notified", done: true, detail: "Amma, Deepa, Rekha" },
        { label: "Location shared (live)", done: false },
      ]}
    />,
  );
  getByText("Guardians notified");
  getByText("Amma, Deepa, Rekha");
  expect(getAllByTestId("actionlog-done")).toHaveLength(1);
  expect(getAllByTestId("actionlog-pending")).toHaveLength(1);
});

test("empty list renders no rows and does not crash", async () => {
  const { queryAllByTestId } = await wrap(<ActionLog tone="default" items={[]} />);
  expect(queryAllByTestId("actionlog-done")).toHaveLength(0);
  expect(queryAllByTestId("actionlog-pending")).toHaveLength(0);
});

test("overflow: every row renders for a long list", async () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ label: `Step ${i}`, done: i % 2 === 0 }));
  const { getAllByTestId } = await wrap(<ActionLog tone="default" items={items} />);
  expect(getAllByTestId("actionlog-done")).toHaveLength(10);
  expect(getAllByTestId("actionlog-pending")).toHaveLength(10);
});

test("preserves item order", async () => {
  const { getAllByText } = await wrap(
    <ActionLog
      tone="default"
      items={[
        { label: "Alpha", done: false },
        { label: "Bravo", done: true },
        { label: "Charlie", done: false },
      ]}
    />,
  );
  const order = getAllByText(/^(Alpha|Bravo|Charlie)$/).map((n) => n.props.children);
  expect(order).toEqual(["Alpha", "Bravo", "Charlie"]);
});
