// W-T4: the button shows only when the browser supports push and permission is not
// yet given; the iPhone line appears when the page is not installed.
import React from "react";
import { alertsUi, AlertsPrompt, IPHONE_LINE } from "@/app/g/[token]/TurnOnAlerts";

const { renderToStaticMarkup }: { renderToStaticMarkup: (el: React.ReactElement) => string } = require("react-dom/server");

const android = { isIos: false, standalone: false, hasPush: true, permission: "default" as NotificationPermission | null };

test.each([
  ["supported, not yet asked", android, "button"],
  ["already allowed", { ...android, permission: "granted" as const }, "hidden"],
  ["blocked", { ...android, permission: "denied" as const }, "hidden"],
  ["browser has no push", { ...android, hasPush: false, permission: null }, "hidden"],
  ["iPhone in Safari, not installed", { isIos: true, standalone: false, hasPush: false, permission: null }, "iphone-line"],
  ["iPhone installed, not yet asked", { isIos: true, standalone: true, hasPush: true, permission: "default" as const }, "button"],
  ["iPhone installed, allowed", { isIos: true, standalone: true, hasPush: true, permission: "granted" as const }, "hidden"],
  ["old iPhone installed, no push", { isIos: true, standalone: true, hasPush: false, permission: null }, "hidden"],
])("%s", (_name, env, expected) => {
  expect(alertsUi(env as Parameters<typeof alertsUi>[0])).toBe(expected);
});

test("the prompt renders the button, the line, or nothing", () => {
  const onClick = () => {};
  const button = renderToStaticMarkup(<AlertsPrompt ui="button" busy={false} failed={false} onClick={onClick} />);
  expect(button).toContain("Turn on alerts");
  expect(button).toContain("<button");
  const line = renderToStaticMarkup(<AlertsPrompt ui="iphone-line" busy={false} failed={false} onClick={onClick} />);
  expect(line).toContain(IPHONE_LINE);
  expect(line).not.toContain("<button");
  expect(renderToStaticMarkup(<AlertsPrompt ui="hidden" busy={false} failed={false} onClick={onClick} />)).toBe("");
});
