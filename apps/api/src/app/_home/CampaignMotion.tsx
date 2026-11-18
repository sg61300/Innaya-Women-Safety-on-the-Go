"use client";

import { useEffect } from "react";

// Progressive-enhancement motion for the campaign page. The page is fully
// server-rendered real HTML; this component only enhances it after hydration:
//   - IntersectionObserver reveals for .reveal elements
//   - nav.scrolled / nav.light toggles
// With JS off or reduced motion, the enhanced pieces no-op and the server HTML
// (handled in home.css) reads in flow.
export function CampaignMotion() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nav = document.getElementById("nav");
    const reveals = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    const lights = Array.from(document.querySelectorAll<HTMLElement>(".warm"));

    document.documentElement.classList.add("js-motion");

    // ---- global nav height (--nav-h): section 1's one-viewport layout pads its top by this so
    //      the eyebrow / "01" never hide under the fixed nav. Measured, updated on resize. ----
    const setNavH = () => {
      if (nav) document.documentElement.style.setProperty("--nav-h", Math.round(nav.getBoundingClientRect().height) + "px");
    };
    setNavH();
    window.addEventListener("resize", setNavH);

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

    // ---- logo walk, transparent (s31 loop rules, s33c stacked alpha) ----
    // Play while the hero logo is on screen, pause when scrolled past, resume when
    // back. The mp4 is stacked 640x1296: colour (rows 0-639), a 16-row black gap so
    // compression cannot bleed colour into the mask, alpha mask (rows 656-1295); WebGL joins
    // them onto the canvas. Reduced motion / no WebGL: the src is never set, so the
    // video never downloads and only the transparent still shows.
    let logoIO: IntersectionObserver | null = null;
    let logoStop = () => {};
    const logoStack = document.querySelector<HTMLElement>(".logo-stack");
    const logo = document.querySelector<HTMLVideoElement>("video[data-logo-src]");
    const logoCanvas = document.querySelector<HTMLCanvasElement>("canvas[data-logo-canvas]");
    if (logoStack && logo && logoCanvas && "IntersectionObserver" in window && !reduce) {
      const gl = logoCanvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
      if (!gl) {
        console.info("[campaign] logo: no WebGL, still image only");
      } else {
        const sh = (type: number, src: string) => {
          const s = gl.createShader(type)!;
          gl.shaderSource(s, src);
          gl.compileShader(s);
          return s;
        };
        const prog = gl.createProgram()!;
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p;varying vec2 uv;void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}"));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER,
          "precision mediump float;varying vec2 uv;uniform sampler2D t;" +
          "void main(){vec3 c=texture2D(t,vec2(uv.x,uv.y*640./1296.)).rgb;float a=texture2D(t,vec2(uv.x,(656.+uv.y*640.)/1296.)).r;gl_FragColor=vec4(c*a,a);}"));
        gl.linkProgram(prog);
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, "p");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.viewport(0, 0, logoCanvas.width, logoCanvas.height);

        let raf = 0;
        let running = false;
        const draw = () => {
          if (logo.readyState >= 2) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, logo);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            if (!logoStack.classList.contains("live")) {
              logoStack.classList.add("live");
              console.info("[campaign] logo: first frame drawn");
            }
          }
          if (running) raf = requestAnimationFrame(draw);
        };
        logoStop = () => { running = false; cancelAnimationFrame(raf); };
        logo.muted = true;
        logoIO = new IntersectionObserver(
          (entries) => {
            entries.forEach((e) => {
              if (e.isIntersecting) {
                if (!logo.src) { logo.src = logo.dataset.logoSrc!; logo.load(); }
                logo.play().then(() => {
                  if (!running) { running = true; raf = requestAnimationFrame(draw); }
                }).catch((err) => console.info("[campaign] logo: play blocked, still image only", err?.name));
              } else {
                logo.pause();
                logoStop();
              }
            });
          },
          { threshold: 0.2 },
        );
        logoIO.observe(logoStack);
      }
    }

    // ---- play-on-view videos (s33c: kada) ----
    // Load + play only while on screen, pause when scrolled past. Reduced motion: never set
    // the src, so only the poster shows and the file is never downloaded.
    let viewIO: IntersectionObserver | null = null;
    const viewVids = Array.from(document.querySelectorAll<HTMLVideoElement>("video[data-play-on-view]"));
    if (viewVids.length && "IntersectionObserver" in window && !reduce) {
      viewIO = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            const v = e.target as HTMLVideoElement;
            if (e.isIntersecting) {
              if (!v.getAttribute("src") && v.dataset.src) { v.src = v.dataset.src; v.load(); }
              v.muted = true;
              void v.play().catch((err) => console.info("[campaign] video: play blocked, poster only", v.dataset.src, err?.name));
            } else v.pause();
          });
        },
        { threshold: 0.2 },
      );
      viewVids.forEach((v) => viewIO!.observe(v));
    }

    // ---- campaign film captions (section 1, s33) ----
    // The film plays via data-play-on-view above. Here we swap the headline in step with
    // the film's edge-on screen cuts. FILM_BOUNDS are the swap times (seconds) from the
    // s33 render timeline; caption i shows from FILM_BOUNDS[i-1]. No-JS: the <noscript> style
    // lists all five steps under the poster. Reduced motion: same sync, no fade (s33e B).
    const film = document.getElementById("campaign-film") as HTMLVideoElement | null;
    const filmCaps = document.querySelector<HTMLElement>(".film-caps");
    const capEls = filmCaps ? Array.from(filmCaps.querySelectorAll<HTMLElement>(".film-cap")) : [];
    const filmReplay = document.getElementById("film-replay") as HTMLButtonElement | null;
    // load on first use (reduced motion never sets src until this), restart from 0, play muted
    const startFilm = () => {
      if (!film) return;
      if (!film.getAttribute("src") && film.dataset.src) { film.src = film.dataset.src; film.load(); }
      film.currentTime = 0;
      film.muted = true;
      void film.play().catch((err) => console.info("[campaign] film: play blocked", err?.name));
    };
    if (film && filmCaps && capEls.length) {
      // FILM_BOUNDS = the 90-degree edge-on swap times (seconds) from the round-2 render
      // timeline; caption i shows from FILM_BOUNDS[i-1]. The collapsed slot is reserved in CSS
      // from first paint, so this only toggles .on (no layout jump). Reduced motion (founder
      // s33e option B): the same one-caption slot, CSS drops the fade so lines switch instantly.
      const FILM_BOUNDS = [3.648, 5.693, 7.738, 9.782];
      const setCap = (i: number) => capEls.forEach((el, k) => el.classList.toggle("on", k === i));
      const idxFor = (t: number) => {
        let i = 0;
        for (const b of FILM_BOUNDS) if (t >= b) i++;
        return Math.min(i, capEls.length - 1);
      };
      setCap(0);
      const onTime = () => setCap(idxFor(film.currentTime));
      film.addEventListener("timeupdate", onTime);
      film.addEventListener("seeked", onTime);
      // Replay (founder round 2): show the button when the film ends; a click restarts the film
      // AND the caption sync from 0. Keyboard works because it is a real <button> (Enter/Space).
      // Reduced motion (founder s33e "Add a Play button", s31 look): it shows as "Play" from the
      // start and the film downloads and plays only on that tap.
      if (filmReplay) {
        film.addEventListener("ended", () => { filmReplay.textContent = "Replay"; filmReplay.classList.add("show"); });
        film.addEventListener("play", () => filmReplay.classList.remove("show"));
        filmReplay.addEventListener("click", () => {
          console.info("[campaign] film:", filmReplay.textContent, "tapped", reduce ? "(reduced motion)" : "");
          setCap(0);
          startFilm();
        });
        if (reduce) { filmReplay.textContent = "Play"; filmReplay.classList.add("show"); }
      }
    }

    // ---- people cylinder carousel (s32, founder 2026-10-12) ----
    // Two phones on a cylinder: her phone front, the guardian view behind. --rot drives it
    // (0 = her front, 1 = guardian front). The FIRST downward scroll through the pinned
    // section turns the back phone to the front (rot 0 -> 1 over the first `swoop` fraction
    // of the hold); after that the visitor turns it themselves with a horizontal mouse
    // drag/swipe, the arrow keys, a horizontal wheel/trackpad, or a touch swipe. The front
    // phone is sized to the space BELOW the fixed header so it is always fully in view.
    // Fully reversible on scroll-up; the swoop replays every time they scroll back down in.
    // Reduced motion / no-JS: CSS flattens to both phones in flow (no pin, no cylinder).
    const peopleSection = document.querySelector<HTMLElement>(".people");
    const peoplePin = document.querySelector<HTMLElement>(".people-pin");
    const peopleStage = document.querySelector<HTMLElement>(".people-stage");
    const peoplePhones = document.getElementById("peopleCyl");
    const pslots = peoplePhones ? Array.from(peoplePhones.querySelectorAll<HTMLElement>(".pcyl-slot")) : [];
    const PCLICK = true; // FOUNDER-TUNABLE (open question): tap/click the back phone to bring it front.
    let peopleScrollHook: (() => void) | null = null;
    let detachPeople: (() => void) | null = null;
    if (peopleSection && peoplePin && peopleStage && peoplePhones && pslots.length === 2) {
      const reduceM = reduce; // reduced motion: same carousel, but phones switch INSTANTLY
      const EASE = 0.2;
      let rot = 0, rotTarget = 0, manual = false, pscale = 1, rafP = 0, lastY = window.scrollY;
      const numVar = (name: string, d: number) => {
        const v = parseFloat(getComputedStyle(peopleSection).getPropertyValue(name));
        return Number.isFinite(v) ? v : d;
      };
      const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
      const onScreen = () => { const r = peopleStage.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; };
      const headerPx = () => { const n = document.getElementById("nav"); return n ? Math.round(n.getBoundingClientRect().height) : 0; };
      const PHW = 290; // native phone frame width (home.css .phone)
      // signed wrapped distance from the front position on a 2-item cycle, range (-1, 1].
      // 0 = this phone is front; +/-1 = it is the side peek (the other phone).
      const dist = (i: number) => { const m = (((i - rot) % 2) + 2) % 2; return m > 1 ? m - 2 : m; };
      const sizeStage = () => {
        const hdr = headerPx();
        peopleStage.style.setProperty("--hdr", hdr + "px");
        const availH = peopleStage.clientHeight || (window.innerHeight - hdr);
        const availW = peopleStage.clientWidth || window.innerWidth;
        const vmargin = numVar("--pcyl-vmargin", 28), hmargin = numVar("--pcyl-hmargin", 22);
        const maxs = numVar("--pcyl-maxscale", 1.08), frontroom = numVar("--pcyl-frontroom", 36);
        // Front phone = full adaptive size (founder 2026-10-12: "front stays big"), sized by
        // the height below the header. `frontroom` is a FIXED side allowance (NOT the peek
        // amount) so the front never fills the whole width and the side phone can tuck behind
        // it and peek out. The front size does NOT change with the peek preset.
        const pscaleH = (availH - 2 * vmargin) / 600;
        const pscaleW = (availW / 2 - hmargin - frontroom) / (PHW / 2);
        pscale = Math.min(pscaleH, pscaleW, maxs);
        if (!(pscale > 0)) pscale = 0.3;
      };
      const render = () => {
        const depth = numVar("--pcyl-depth", 300), turn = numVar("--pcyl-turn", 34);
        const backscale = numVar("--pcyl-backscale", 0.62), backop = numVar("--pcyl-backop", 0.3);
        const peek = numVar("--pcyl-peek", 72), hmargin = numVar("--pcyl-hmargin", 22);
        // mid-turn arc (founder 2026-10-13: "reduce the overlap"): during the crossover the
        // phones are pushed further back (zarc), bowed apart (xarc) and shrunk (midshrink) so
        // they barely cross. All peak at the mid-turn and are ZERO at rest, so the rest look
        // and the front size are unchanged.
        const zarc = numVar("--pcyl-zarc", 260), xarc = numVar("--pcyl-xarc", 40), midshrink = numVar("--pcyl-midshrink", 0.16);
        const availW = peopleStage.clientWidth || window.innerWidth;
        const frontHalf = (PHW / 2) * pscale;
        // side phone centre offset so its OUTER edge sits `peek` px past the front edge; the
        // rest of it tucks BEHIND the front. Clamped per-phone so it never leaves the viewport.
        const sidePx = frontHalf * (1 - backscale) + peek;
        pslots.forEach((slot, i) => {
          const d = dist(i);
          const a = Math.min(Math.abs(d), 1);
          const front01 = 1 - a; // 1 fully front, 0 full side peek
          const midF = Math.sin(a * Math.PI); // 0 at rest (front & side), 1 at the mid-turn crossover
          const sf = (1 - a * (1 - backscale) - midshrink * midF) * pscale;
          const hw = (PHW / 2) * sf; // this phone's rendered half-width
          const maxX = Math.max(0, availW / 2 - hmargin - hw); // keep fully inside the viewport
          let x = d * sidePx + (d === 0 ? 0 : Math.sign(d) * xarc * midF);
          if (x > maxX) x = maxX; else if (x < -maxX) x = -maxX;
          const z = -(a * depth + zarc * midF) * pscale;
          const ry = d === 0 ? 0 : -Math.sign(d) * turn * a;
          const op = 1 - a * (1 - backop);
          slot.style.transform = `translate(-50%,-50%) translateX(${x.toFixed(1)}px) translateZ(${z.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) scale(${sf.toFixed(3)})`;
          slot.style.opacity = op.toFixed(3);
          slot.style.zIndex = String(Math.round(front01 * 10));
          slot.dataset.front = front01 > 0.5 ? "1" : "0";
        });
      };
      const apply = () => { rot = rotTarget; render(); }; // reduced motion: instant, no turn
      const tick = () => {
        rot += (rotTarget - rot) * EASE;
        if (Math.abs(rotTarget - rot) < 0.0005) rot = rotTarget;
        render();
        rafP = rot !== rotTarget ? requestAnimationFrame(tick) : 0;
      };
      const ensureRaf = () => { if (reduceM) { apply(); return; } if (!rafP) rafP = requestAnimationFrame(tick); };
      // a discrete turn: step one phone-position in `dir` (the cylinder wraps, so repeated
      // same-direction input keeps bringing the other phone to the front — 2 phones = a toggle).
      const turnBy = (dir: number) => { manual = true; rotTarget = Math.round(rotTarget) + dir; ensureRaf(); };
      const norm = (v: number) => ((Math.round(v) % 2) + 2) % 2; // snap to 0 (her) / 1 (guardian)
      // scroll hook (called from onScroll): bind rot to the pin progress until the visitor
      // takes manual control; reset `manual` once the section has fully left the viewport so
      // the swoop replays every time they scroll back down into it.
      peopleScrollHook = () => {
        const y = window.scrollY, dir = y - lastY; lastY = y;
        const r = peoplePin.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) { if (manual) { manual = false; rotTarget = norm(rotTarget); rot = norm(rot); if (reduceM) render(); } return; }
        if (manual) return;
        // founder 2026-10-13: ONLY a downward scroll into the section replays her->guardian.
        // Scrolling up (entering from below) keeps whichever phone is in front.
        if (dir <= 0) return;
        const span = peoplePin.offsetHeight - peopleStage.offsetHeight; // = hold + header, in px
        const sp = span > 0 ? clamp01((headerPx() - r.top) / span) : 0;
        const swoop = numVar("--people-swoop", 0.5) || 0.5;
        const t = clamp01(sp / swoop);
        rotTarget = reduceM ? (t >= 0.5 ? 1 : 0) : t; // reduced motion: snap at the midpoint, no swoop
        ensureRaf();
      };
      // inputs ----
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
        if (!onScreen()) return;
        e.preventDefault();
        turnBy(e.key === "ArrowRight" ? 1 : -1);
      };
      let wheelLock = 0;
      const onWheel = (e: WheelEvent) => {
        if (!onScreen()) return;
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 12) return; // vertical -> let the page scroll
        e.preventDefault();
        if (Date.now() < wheelLock) return;
        wheelLock = Date.now() + 450;
        turnBy(e.deltaX > 0 ? 1 : -1);
      };
      // a horizontal mouse drag or touch swipe turns the cylinder; a vertical drag is left to
      // scroll the page (no pointer capture, no preventDefault on the vertical axis). A near-
      // still tap/click on the VISIBLE part of the side phone turns it to the front (PCLICK).
      const inRect = (r: DOMRect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      // true when (x,y) is over the side phone's VISIBLE sliver (inside it, and not hidden
      // behind the front phone). Geometric, because elementFromPoint is unreliable on the
      // 3D-transformed slivers.
      const tapHitsSide = (x: number, y: number) => {
        const F = pslots.find((s) => s.dataset.front === "1");
        const B = pslots.find((s) => s !== F);
        if (!F || !B) return false;
        const fr = (F.querySelector(".phone") as HTMLElement).getBoundingClientRect();
        const br = (B.querySelector(".phone") as HTMLElement).getBoundingClientRect();
        return inRect(br, x, y) && !inRect(fr, x, y);
      };
      let px = 0, py = 0, lx = 0, ly = 0, pdown = false, pmoved = false, dragTurned = 0;
      const onDown = (e: PointerEvent) => { pdown = true; pmoved = false; px = lx = e.clientX; py = ly = e.clientY; };
      const onMove = (e: PointerEvent) => { if (!pdown) return; lx = e.clientX; ly = e.clientY; pmoved = true; };
      const onUp = (e: PointerEvent) => {
        if (!pdown) return; pdown = false;
        const ex = pmoved ? lx : e.clientX, ey = pmoved ? ly : e.clientY;
        const dx = ex - px, dy = ey - py;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { dragTurned = Date.now() + 350; turnBy(dx < 0 ? 1 : -1); return; }
        // a tap: not right after a drag/swipe, and on the visible side-phone sliver
        if (PCLICK && Math.abs(dx) < 8 && Math.abs(dy) < 8 && Date.now() > dragTurned && tapHitsSide(px, py)) turnBy(1);
      };
      const onResizeP = () => { sizeStage(); render(); };
      // stop the browser's native image drag-and-drop, which otherwise cancels the pointer
      // stream mid-drag (the phones contain <img>), so a horizontal mouse drag is lost.
      const onDragStart = (e: Event) => e.preventDefault();
      sizeStage(); render();
      document.addEventListener("keydown", onKey);
      peoplePhones.addEventListener("wheel", onWheel, { passive: false });
      peoplePhones.addEventListener("dragstart", onDragStart);
      peoplePhones.addEventListener("pointerdown", onDown);
      peoplePhones.addEventListener("pointermove", onMove);
      peoplePhones.addEventListener("pointerup", onUp);
      peoplePhones.addEventListener("pointercancel", () => { pdown = false; });
      window.addEventListener("resize", onResizeP, { passive: true });
      detachPeople = () => {
        document.removeEventListener("keydown", onKey);
        peoplePhones.removeEventListener("wheel", onWheel);
        peoplePhones.removeEventListener("dragstart", onDragStart);
        peoplePhones.removeEventListener("pointerdown", onDown);
        peoplePhones.removeEventListener("pointermove", onMove);
        peoplePhones.removeEventListener("pointerup", onUp);
        window.removeEventListener("resize", onResizeP);
        if (rafP) cancelAnimationFrame(rafP);
      };
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
      if (!peopleScrollHook) return;
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { peopleScrollHook?.(); ticking = false; });
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    // ---- jewellery swipe (s31, founder-approved v3, ported from the preview) ----
    // Native horizontal scroll drives a per-piece 3D transform: the piece at the strip
    // centre faces you in true colour; neighbours turn away and recede by their distance
    // from centre. A sheen band crosses a piece ONLY while it moves (off it at rest). Works
    // with swipe, trackpad, mouse drag and the arrow keys. Reduced motion skips the 3D.
    const strip = document.getElementById("jewelStrip");
    const jslides = strip ? Array.from(strip.querySelectorAll<HTMLElement>(".jewel-slide")) : [];
    let detachStrip: (() => void) | null = null;
    if (strip && jslides.length) {
      const MAX_RY = 38, DEPTH = 160; // a neighbour one step away turns 38deg, sits 160px back
      let sticking = false;
      const render = () => {
        const sr = strip.getBoundingClientRect(), mid = sr.left + sr.width / 2;
        jslides.forEach((sl) => {
          const r = sl.getBoundingClientRect();
          const d = Math.max(-1.6, Math.min(1.6, (r.left + r.width / 2 - mid) / r.width));
          const piece = sl.firstElementChild as HTMLElement | null;
          if (!piece || reduce) return;
          const a = Math.abs(d);
          piece.style.transform =
            `translateZ(${(-DEPTH * a).toFixed(1)}px) rotateY(${(-d * MAX_RY).toFixed(2)}deg) scale(${(1 - 0.24 * Math.min(a, 1)).toFixed(3)})`;
          piece.style.opacity = (1 - 0.2 * Math.min(a, 1)).toFixed(3);
          const sheen = piece.querySelector<HTMLElement>(".sheen");
          if (sheen) sheen.style.backgroundPosition = `${(120 - 170 * Math.min(a, 1)).toFixed(1)}% 0`;
        });
      };
      const onStripScroll = () => { if (!sticking) { sticking = true; requestAnimationFrame(() => { render(); sticking = false; }); } };
      // target remembers where a smooth scroll is heading, so quick repeated keys keep stepping
      let targetI: number | null = null, clearT = 0;
      const current = () => {
        let best = 0, bd = 1e9; const mid = strip.scrollLeft + strip.clientWidth / 2;
        jslides.forEach((sl, i) => { const d = Math.abs(sl.offsetLeft + sl.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
        return best;
      };
      const go = (i: number) => {
        i = Math.max(0, Math.min(jslides.length - 1, i)); targetI = i;
        clearTimeout(clearT); clearT = window.setTimeout(() => { targetI = null; }, 700);
        const sl = jslides[i];
        strip.scrollTo({ left: sl.offsetLeft + sl.offsetWidth / 2 - strip.clientWidth / 2, behavior: reduce ? "auto" : "smooth" });
      };
      // arrow keys work whenever the strip is on screen (not only when it is focused), but
      // never while typing in a field and never when the strip is off screen, so the page's
      // own arrow-key scrolling elsewhere is not hijacked.
      const onDocKey = (e: KeyboardEvent) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
        const r = strip.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= window.innerHeight) return; // strip not on screen
        const base = targetI === null ? current() : targetI;
        e.preventDefault();
        go(e.key === "ArrowRight" ? base + 1 : base - 1);
      };
      // click a piece to bring it to the front (suppressed right after a drag so releasing a
      // drag does not also register as a click).
      let justDragged = 0;
      const onClick = (e: MouseEvent) => {
        if (Date.now() < justDragged) return;
        const sl = (e.target as HTMLElement | null)?.closest(".jewel-slide");
        if (!sl) return;
        const i = jslides.indexOf(sl as HTMLElement);
        if (i >= 0) go(i);
      };
      // mouse drag on a laptop (touch and trackpad already scroll natively)
      let down = false, sx = 0, sl0 = 0, moved = 0, i0 = 0;
      const onDown = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return;
        down = true; moved = 0; i0 = current(); sx = e.clientX; sl0 = strip.scrollLeft;
        strip.classList.add("drag"); strip.setPointerCapture(e.pointerId);
      };
      const onMove = (e: PointerEvent) => { if (!down) return; moved = e.clientX - sx; strip.scrollLeft = sl0 - moved; };
      const onUp = (e: PointerEvent) => {
        if (!down) return; down = false; strip.classList.remove("drag");
        if (Math.abs(moved) <= 6) {
          // a mouse click: pointer capture retargets the click event to the strip, so onClick
          // cannot see which piece was hit; resolve it from the pointer position instead.
          const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest(".jewel-slide");
          const hi = hit ? jslides.indexOf(hit as HTMLElement) : -1;
          if (hi >= 0) { go(hi); return; }
        }
        if (Math.abs(moved) > 6) justDragged = Date.now() + 350; // suppress the click that follows a drag
        // a deliberate drag (> 40px) always moves one piece that way, even if short of half a slide
        let i = current(); if (i === i0 && Math.abs(moved) > 40) { i = i0 + (moved < 0 ? 1 : -1); } go(i);
      };
      // full-bleed, scrollbar/zoom-safe: span the viewport CONTENT width (clientWidth, which
      // excludes the scrollbar) and align the strip's left edge to content x=0, so the three
      // pieces stay centred on the page centre at any scrollbar width or browser zoom. This
      // replaces the CSS 100vw/50vw breakout, which counts the scrollbar inside vw.
      // s33c (founder, Firefox): the old version MEASURED the strip's on-screen left with
      // getBoundingClientRect at start-up; in Firefox that measurement could be stale, and the
      // strip stayed shifted right, so the right-most piece sat at the strip centre but right
      // of the page centre. Now pure arithmetic, no measuring: the parent .wrap is centred on
      // the page, so margin-left = (parent width - page width) / 2 centres the strip exactly.
      const layoutStrip = () => {
        const cw = document.documentElement.clientWidth;  // content width, scrollbar excluded
        strip.style.width = cw + "px";
        strip.style.marginLeft = `calc((100% - ${cw}px) / 2)`;
        console.info("[campaign] jewel strip layout", { cw });
      };
      const startStrip = () => {
        targetI = null;
        layoutStrip();
        strip.scrollLeft = jslides[1].offsetLeft + jslides[1].offsetWidth / 2 - strip.clientWidth / 2;
        render();
      };
      strip.addEventListener("scroll", onStripScroll, { passive: true });
      document.addEventListener("keydown", onDocKey);
      strip.addEventListener("click", onClick);
      strip.addEventListener("pointerdown", onDown);
      strip.addEventListener("pointermove", onMove);
      strip.addEventListener("pointerup", onUp);
      strip.addEventListener("pointercancel", onUp);
      // re-lay out only when the page width really changes (window resize OR a scrollbar
      // appearing/disappearing, which fires no resize event); height changes are ignored so
      // the strip never jumps back to the middle piece while someone is using it.
      let stripCw = -1;
      const onWidth = () => {
        const cw = document.documentElement.clientWidth;
        if (cw !== stripCw) { stripCw = cw; startStrip(); }
      };
      const stripRO = "ResizeObserver" in window ? new ResizeObserver(onWidth) : null;
      stripRO?.observe(document.documentElement);
      window.addEventListener("resize", onWidth, { passive: true });
      onWidth();
      detachStrip = () => {
        strip.removeEventListener("scroll", onStripScroll);
        document.removeEventListener("keydown", onDocKey);
        strip.removeEventListener("click", onClick);
        strip.removeEventListener("pointerdown", onDown);
        strip.removeEventListener("pointermove", onMove);
        strip.removeEventListener("pointerup", onUp);
        strip.removeEventListener("pointercancel", onUp);
        window.removeEventListener("resize", onWidth);
        stripRO?.disconnect();
        clearTimeout(clearT);
      };
    }

    // ---- resize: re-sync the people cylinder without reload ----
    function onResize() {
      peopleScrollHook?.(); // re-sync the people cylinder's rotation after a width/height change
    }
    window.addEventListener("resize", onResize, { passive: true });

    onScroll();
    onResize();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("resize", setNavH);
      io?.disconnect(); logoIO?.disconnect(); logoStop(); viewIO?.disconnect();
      detachStrip?.();
      detachPeople?.();
    };
  }, []);

  return null;
}
