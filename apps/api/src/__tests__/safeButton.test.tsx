// ChatGPT 12: an open page greys Safe at the deadline without a refresh. No browser here, so the
// effect is captured and run with fake timers; the rendered attributes are checked directly.
import React from "react";

const { renderToStaticMarkup }: { renderToStaticMarkup: (el: React.ReactElement) => string } = require("react-dom/server");

afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

const load = () => require("@/app/g/[token]/SafeButton").SafeButton as React.FC<{ closed: boolean; until?: number }>;

test("before the deadline enabled; at the deadline the state flips by itself, not before", () => {
  jest.useFakeTimers();
  const setOver = jest.fn();
  let effect: (() => unknown) | undefined;
  jest.spyOn(React, "useState").mockImplementation((() => [false, setOver]) as never);
  jest.spyOn(React, "useEffect").mockImplementation(((fn: () => unknown) => { effect = fn; }) as never);
  const SafeButton = load();
  expect(renderToStaticMarkup(<SafeButton closed={false} until={Date.now() + 5000} />)).not.toContain("disabled");
  effect!();
  jest.advanceTimersByTime(4999);
  expect(setOver).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(setOver).toHaveBeenCalledWith(true);
});

test("already past: rendered disabled, grey", () => {
  const SafeButton = load();
  const html = renderToStaticMarkup(<SafeButton closed={true} until={Date.now() - 1} />);
  expect(html).toContain("disabled");
  expect(html).toContain("#9ca3af");
});
