"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Records the in-app path we are leaving on each client navigation, so a detail
// page's back control knows whether the visitor arrived from the collection
// (Next uses soft navigation, so document.referrer is not reliable for this).
export function NavMemory() {
  const pathname = usePathname();
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (prev.current !== null && prev.current !== pathname) {
      try {
        sessionStorage.setItem("vaira:prev-path", prev.current);
      } catch {
        /* private mode / storage blocked: back control falls back to its href */
      }
    }
    prev.current = pathname;
  }, [pathname]);
  return null;
}
