"use client";
import { useEffect, useState } from "react";

export const IPHONE_LINE = "On iPhone, add this page to your Home Screen and open it from there to turn on alerts.";

export type AlertsUi = "hidden" | "button" | "iphone-line";
type BrowserEnv = { isIos: boolean; standalone: boolean; hasPush: boolean; permission: NotificationPermission | null };

export function alertsUi({ isIos, standalone, hasPush, permission }: BrowserEnv): AlertsUi {
  if (isIos && !standalone) return "iphone-line";
  return hasPush && permission === "default" ? "button" : "hidden";
}

function readEnv(): BrowserEnv {
  const nav = navigator as Navigator & { standalone?: boolean };
  const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return {
    // iPadOS reports itself as a Mac; touch points tell them apart.
    isIos: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    standalone: nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches,
    hasPush,
    permission: hasPush ? Notification.permission : null,
  };
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "="));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Registers the worker, subscribes this browser, and saves it for this guardian.
async function subscribe(token: string, publicKey: string): Promise<void> {
  const reg = await navigator.serviceWorker.register("/g/sw.js", { scope: "/g/" });
  await navigator.serviceWorker.ready;
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const res = await fetch("/api/guardian-push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, subscription: subscription.toJSON() }),
  });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
}

export function AlertsPrompt({ ui, busy, failed, onClick }: { ui: AlertsUi; busy: boolean; failed: boolean; onClick: () => void }) {
  if (ui === "hidden") return null;
  if (ui === "iphone-line") return <p style={{ margin: 16, font: "14px system-ui", color: "#374151" }}>{IPHONE_LINE}</p>;
  return (
    <div style={{ margin: 16 }}>
      <button type="button" disabled={busy} onClick={onClick} style={{ width: "100%", padding: 14, font: "700 16px system-ui", color: "#fff", background: "#1f2937", border: 0, borderRadius: 8 }}>
        Turn on alerts
      </button>
      {failed && <p style={{ margin: "8px 0 0", font: "14px system-ui", color: "#b91c1c" }}>Could not turn on alerts. Try again.</p>}
    </div>
  );
}

export function TurnOnAlerts({ token, publicKey }: { token: string; publicKey: string }) {
  const [ui, setUi] = useState<AlertsUi>("hidden");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const env = readEnv();
    setUi(alertsUi(env));
    // Already allowed in this browser (another guardian link, or a rotated
    // subscription): save it quietly. If that fails, offer the button again.
    if (env.hasPush && env.permission === "granted" && !(env.isIos && !env.standalone))
      subscribe(token, publicKey).catch((e) => {
        console.error("[alerts] quiet save failed", e);
        setUi("button");
      });
  }, [token, publicKey]);

  const onClick = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") await subscribe(token, publicKey);
      setUi("hidden");
    } catch (e) {
      console.error("[alerts] turn on failed", e);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return <AlertsPrompt ui={ui} busy={busy} failed={failed} onClick={onClick} />;
}
