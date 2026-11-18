"use client";

import { useEffect } from "react";

// Fires products_opened once per page open (the M6 denominator). An anonymous
// per-browser visitor id (localStorage) lets the metric count distinct visitors
// and share a denominator with product_registered. No PII, best-effort: any
// failure is swallowed so it never affects the page.

const VKEY = "vaira.visitor_id";

function visitorId(): string {
  try {
    let v = localStorage.getItem(VKEY);
    if (!v) {
      v =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(VKEY, v);
    }
    return v;
  } catch {
    return `v-${Date.now()}`;
  }
}

// `product` is the slug on a detail-page beacon (product_viewed); the collection
// beacon (products_opened) leaves it undefined. Sent so m9/m10 can attribute.
export function PageOpenedBeacon({
  type = "products_opened",
  product,
}: {
  type?: string;
  product?: string;
}) {
  useEffect(() => {
    const body = JSON.stringify({ type, visitor_id: visitorId(), ...(product ? { product } : {}) });
    try {
      fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }, [type, product]);
  return null;
}
