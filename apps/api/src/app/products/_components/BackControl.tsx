"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Back control shown in the sticky top bar on a product detail page only
// (/products/<slug>), left of the wordmark. It goes to /products#collection,
// but if the visitor arrived from the collection it steps back in history so
// the collection is restored at its previous scroll position.
export function BackControl() {
  const pathname = usePathname();
  const isDetail = /^\/products\/[^/]+$/.test(pathname ?? "");
  if (!isDetail) return null;

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (typeof window === "undefined") return;
    try {
      // Came from the collection this session? Step back so its scroll position
      // is restored. Covers both soft navigation (NavMemory) and a hard load
      // (document.referrer). Otherwise the href takes over.
      let fromCollection = sessionStorage.getItem("vaira:prev-path") === "/products";
      if (!fromCollection && document.referrer) {
        const ref = new URL(document.referrer);
        fromCollection = ref.origin === window.location.origin && ref.pathname === "/products";
      }
      if (fromCollection && window.history.length > 1) {
        e.preventDefault();
        window.history.back();
      }
    } catch {
      /* fall through to the href */
    }
  };

  return (
    <Link href="/products#collection" className="v-back" onClick={onClick} aria-label="Back to collection">
      <span className="v-back__chevron" aria-hidden>‹</span>
      <span className="v-back__label">Collection</span>
    </Link>
  );
}
