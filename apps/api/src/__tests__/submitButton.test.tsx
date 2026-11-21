// Guardian vote button (Safe / Not safe). The test env is node (no DOM), so — as the old
// SafeButton test did — React hooks are spied and the component is rendered with
// renderToStaticMarkup / called directly to drive and inspect its state.
import React from "react";

const { renderToStaticMarkup }: { renderToStaticMarkup: (el: React.ReactElement) => string } = require("react-dom/server");

afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

const load = () =>
  require("@/app/g/[token]/SubmitButton").SubmitButton as React.FC<{
    action: string; value: "true" | "false"; label: string; background: string; closed?: boolean; until?: number;
  }>;

const base = { action: "/api/cancel-request/r1/vote?t=x", value: "true" as const, label: "Safe — cancel the alarm", background: "#065f46" };

// T-SAFE-1 (part a): once the form is on its way the button is disabled, greyed and shows
// "Sending…", and a centre-screen overlay shows the walking-logo loader (not inside the button).
test("T-SAFE-1a: the sending state is disabled, grey, labelled Sending…, with a centre loader", () => {
  jest.spyOn(React, "useState")
    .mockImplementationOnce((() => [false, jest.fn()]) as never) // over
    .mockImplementationOnce((() => [true, jest.fn()]) as never); // sending
  jest.spyOn(React, "useEffect").mockImplementation((() => {}) as never);
  const SubmitButton = load();
  const html = renderToStaticMarkup(<SubmitButton {...base} />);
  expect(html).toContain("Sending…");
  expect(html).toContain("disabled");
  expect(html).toContain("#9ca3af"); // greyed button underneath
  expect(html).toContain('role="status"'); // the loader is present
  // the loader sits in a full-screen centre overlay (campaign dark-plum layer), not in the button
  expect(html).toContain("#17111F"); // campaign dark-plum full-screen layer
  expect(html).toContain("position:fixed"); // the overlay covers the screen
  // the loader is the walking INNAYA logo (approved campaign walk, small strip), not the old ring
  expect(html).toContain("/guardian/logo-walk-strip.webp");
  expect(html).toContain("innaya-walk");
  expect(html).toContain("prefers-reduced-motion:reduce"); // still frame with reduced motion
  expect(html).not.toContain("animateTransform");
  expect(html).not.toContain("Safe — cancel the alarm"); // the label is replaced while sending
});

// T-SAFE-1 (part b): submitting flips the button to sending and does NOT prevent the native POST
// (progressive enhancement — still a form post, never fetch).
test("T-SAFE-1b: onSubmit sets sending and never calls preventDefault", () => {
  const setSending = jest.fn();
  jest.spyOn(React, "useState")
    .mockImplementationOnce((() => [false, jest.fn()]) as never) // over
    .mockImplementationOnce((() => [false, setSending]) as never); // sending
  jest.spyOn(React, "useEffect").mockImplementation((() => {}) as never);
  const SubmitButton = load();
  const tree = (SubmitButton as unknown as (p: typeof base) => React.ReactElement)(base);
  const onSubmit = (tree.props as { onSubmit: (e: { preventDefault: () => void }) => void }).onSubmit;
  const preventDefault = jest.fn();
  onSubmit({ preventDefault });
  expect(setSending).toHaveBeenCalledWith(true);
  expect(preventDefault).not.toHaveBeenCalled();
  // the native form carries the vote and posts to the vote route
  expect((tree.props as { action: string; method: string }).action).toBe(base.action);
  expect((tree.props as { method: string }).method).toBe("post");
});

// T-SAFE-2: with the deadline already passed the button is disabled and grey, and NO loader shows.
test("T-SAFE-2: past the deadline it is disabled and grey with no loader", () => {
  const SubmitButton = load();
  const html = renderToStaticMarkup(<SubmitButton {...base} closed={true} until={Date.now() - 1} />);
  expect(html).toContain("disabled");
  expect(html).toContain("#9ca3af");
  expect(html).not.toContain('role="status"'); // no loader on the dead button
  expect(html).not.toContain("innaya-walk");
  expect(html).not.toContain("Sending…");
  expect(html).toContain("Safe — cancel the alarm");
});

// The 35-min deadline greying still works: live before the deadline, flips itself at it, not before.
test("deadline: enabled before, flips to over exactly at the deadline", () => {
  jest.useFakeTimers();
  const setOver = jest.fn();
  let effect: (() => unknown) | undefined;
  jest.spyOn(React, "useState")
    .mockImplementationOnce((() => [false, setOver]) as never) // over
    .mockImplementationOnce((() => [false, jest.fn()]) as never); // sending
  jest.spyOn(React, "useEffect").mockImplementation(((fn: () => unknown) => { effect = fn; }) as never);
  const SubmitButton = load();
  expect(renderToStaticMarkup(<SubmitButton {...base} until={Date.now() + 5000} />)).not.toContain("disabled");
  effect!();
  jest.advanceTimersByTime(4999);
  expect(setOver).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(setOver).toHaveBeenCalledWith(true);
});
