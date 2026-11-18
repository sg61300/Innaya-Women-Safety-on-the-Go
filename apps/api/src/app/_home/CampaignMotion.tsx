"use client";

import { useEffect } from "react";

// Progressive-enhancement motion for the campaign page. The page is fully
// server-rendered real HTML; this component only enhances it after hydration:
//   - IntersectionObserver reveals for .reveal elements
//   - nav.scrolled / nav.light toggles
//   - desktop story (>= 981px, tall window, motion allowed): ONE active index
//     derived from the pinned stage's scroll progress drives BOTH the lit step
//     (aria-current="step") and the visible phone pane (.pane.on), so the step
//     text and the phone screen always show the same beat (single source of truth).
//   - phone story (<= 980px): a self-advancing snap carousel that pops its first
//     card on entry, auto-advances through the four beats, and stops for good on
//     any touch/swipe/dot tap; pauses off-screen, resumes from the current card.
// With JS off, reduced motion, or a short window, CSS flattens the story so every
// step and a phone pane read in flow (handled in home.css); the JS below no-ops.
export function CampaignMotion() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nav = document.getElementById("nav");
    const stage = document.querySelector<HTMLElement>(".app-seq");
    const reveals = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    const lights = Array.from(document.querySelectorAll<HTMLElement>(".warm"));

    document.documentElement.classList.add("js-motion");

    // ---- reveals ----
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window && !reduce) {
      io = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((e) => {
            if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
          });
        },
        { threshold: 0.14 },
      );
      reveals.forEach((el) => io!.observe(el));
    } else {
      reveals.forEach((el) => el.classList.add("in"));
    }

    // ---- desktop story: one index, two outputs ----
    const beats = stage ? Array.from(stage.querySelectorAll<HTMLElement>(".stage-copy .beats .beat")) : [];
    const stagePanes = stage ? Array.from(stage.querySelectorAll<HTMLElement>("#phone-stage .pane")) : [];
    const counter = stage ? stage.querySelector<HTMLElement>(".seq-counter .cur") : null;
    const BEATS = 4;
    let lastIdx = -1;

    function applyIndex(idx: number) {
      lastIdx = idx;
      beats.forEach((b, k) => (k === idx ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
      stagePanes.forEach((p) => p.classList.toggle("on", p.dataset.pane === String(idx)));
      if (counter) counter.textContent = String(idx + 1).padStart(2, "0");
    }
    function scrubMode() {
      return !reduce && window.innerWidth > 980 && window.innerHeight > 700 && !!stage;
    }
    function desktopActive() {
      if (!scrubMode()) return;
      const r = stage!.getBoundingClientRect();
      const span = stage!.offsetHeight - window.innerHeight;
      const sp = span > 0 ? Math.max(0, Math.min(1, -r.top / span)) : 0;
      let idx = Math.floor(sp * BEATS);
      if (idx > BEATS - 1) idx = BEATS - 1;
      if (idx < 0) idx = 0;
      if (idx !== lastIdx) applyIndex(idx);
    }

    // ---- nav + scroll handler ----
    let ticking = false;
    function onScroll() {
      const y = window.scrollY;
      if (nav) {
        nav.classList.toggle("scrolled", y > 40);
        const navH = nav.offsetHeight;
        nav.classList.toggle("light", lights.some((el) => { const r = el.getBoundingClientRect(); return r.top <= navH && r.bottom > navH; }));
      }
      if (!scrubMode()) return;
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { desktopActive(); ticking = false; });
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    // ---- phone carousel (<= 980px) ----
    const carousel = document.querySelector<HTMLElement>(".beats-carousel");
    const dots = Array.from(document.querySelectorAll<HTMLButtonElement>(".carousel-dots .cdot"));
    const cards = carousel ? Array.from(carousel.querySelectorAll<HTMLElement>(".vcard")) : [];
    const DWELL = 2600;
    let cur = 0, interacted = false, completed = false, popped = false, timer: number | undefined;
    let cio: IntersectionObserver | null = null, sectionIO: IntersectionObserver | null = null;

    function clearTimer() { if (timer) { clearTimeout(timer); timer = undefined; } }
    function selectDots(active: number, animate: boolean) {
      dots.forEach((d, k) => {
        d.setAttribute("aria-selected", k === active ? "true" : "false");
        const fill = d.querySelector<HTMLElement>(".fill");
        if (!fill) return;
        if (animate && k === active) {
          fill.style.transition = "none"; fill.style.transform = "scaleX(0)";
          void fill.offsetWidth; // reflow so the fill restarts
          fill.style.transition = `transform ${DWELL}ms linear`; fill.style.transform = "scaleX(1)";
        } else {
          fill.style.transition = "none"; fill.style.transform = "";
        }
      });
    }
    function scrollToCard(k: number) {
      const card = cards[k]; if (!card || !carousel) return;
      const left = card.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2;
      carousel.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    }
    function playFrom(k: number) {
      if (interacted || reduce) return;
      cur = k;
      selectDots(k, true);
      scrollToCard(k);
      clearTimer();
      timer = window.setTimeout(() => {
        if (interacted) return;
        if (k < BEATS - 1) playFrom(k + 1);
        else completed = true;
      }, DWELL);
    }
    function enter() {
      if (!popped) { popped = true; carousel?.classList.remove("pre"); }
      if (interacted || reduce || completed) return;
      clearTimer();
      timer = window.setTimeout(() => playFrom(cur), 360);
    }
    function leave() { clearTimer(); }
    function stopForGood() {
      if (interacted) return;
      interacted = true; clearTimer();
      selectDots(cur, false); // freeze current dot filled, no animation
    }

    if (carousel) {
      if (reduce) {
        carousel.classList.remove("pre"); // show first card, no pop/autoplay
      } else {
        ["pointerdown", "touchstart", "keydown"].forEach((ev) =>
          carousel.addEventListener(ev, stopForGood, { passive: true }),
        );
        sectionIO = new IntersectionObserver(
          (es) => es.forEach((e) => (e.isIntersecting ? enter() : leave())),
          { threshold: 0.35 },
        );
        sectionIO.observe(carousel);
      }
      // active-dot sync from the snapped card (manual swipe or autoplay), always on
      dots.forEach((d, k) => d.addEventListener("click", () => { stopForGood(); cur = k; selectDots(k, false); scrollToCard(k); }));
      if ("IntersectionObserver" in window) {
        cio = new IntersectionObserver(
          (es) => {
            es.forEach((e) => {
              if (e.isIntersecting && e.intersectionRatio >= 0.55) {
                const k = cards.indexOf(e.target as HTMLElement);
                if (k >= 0) { cur = k; if (interacted || reduce) selectDots(k, false); }
              }
            });
          },
          { root: carousel, threshold: [0.55, 0.8] },
        );
        cards.forEach((c) => cio!.observe(c));
      }
    }

    // ---- resize: re-lay out the story without reload ----
    function onResize() {
      lastIdx = -1;
      if (scrubMode()) desktopActive();
      else if (stage) applyIndex(0); // flatten / mobile: clean default (pane 0, step 1)
    }
    window.addEventListener("resize", onResize, { passive: true });

    onScroll();
    onResize();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      clearTimer();
      io?.disconnect(); cio?.disconnect(); sectionIO?.disconnect();
    };
  }, []);

  return null;
}
