// T3: crawler block + tester-terms page. Covers all three block layers and the
// public page. Jest runs in node with no server, so "served" is verified through
// the artefacts Next serves verbatim: the static public files on disk and the
// header rule next.config feeds to the platform.
import fs from "fs";
import path from "path";
import React from "react";
import { securityHeaders, ROBOTS_TAG, NOINDEX_SOURCES } from "@/lib/securityHeaders";

const { renderToStaticMarkup }: { renderToStaticMarkup: (el: React.ReactElement) => string } = require("react-dom/server");

const PUBLIC = path.join(__dirname, "../../public");

// Robots scoping (founder ruling 2026-09-24 campaign): "/" and "/products*" are
// indexable; the private/functional paths stay noindex on all three layers.
describe("X-Robots-Tag header (next.config)", () => {
  const rules = securityHeaders();
  const sources = rules.map((r) => r.source);

  test("tags every noindex path with noindex, nofollow, noarchive", () => {
    expect(ROBOTS_TAG).toBe("noindex, nofollow, noarchive");
    for (const src of NOINDEX_SOURCES) {
      const rule = rules.find((r) => r.source === src);
      expect(rule).toBeDefined();
      expect(rule!.headers.find((h) => h.key === "X-Robots-Tag")?.value).toBe("noindex, nofollow, noarchive");
    }
  });

  test("covers api, g, download and tester-terms", () => {
    expect(sources).toEqual(expect.arrayContaining(["/api/:path*", "/g/:path*", "/download/:path*", "/tester-terms"]));
  });

  test("does NOT tag the indexable public pages (/ and /products)", () => {
    expect(sources).not.toContain("/:path*");
    expect(sources.some((s) => s === "/" || s === "/products" || s.startsWith("/products"))).toBe(false);
  });
});

describe("public/robots.txt", () => {
  const txt = fs.readFileSync(path.join(PUBLIC, "robots.txt"), "utf8");

  test("allows the campaign page and products, disallows the functional paths", () => {
    expect(txt).toMatch(/User-agent:\s*\*/);
    expect(txt).toMatch(/Allow:\s*\/\$/);
    expect(txt).toMatch(/Allow:\s*\/products/);
    expect(txt).toMatch(/Disallow:\s*\/api\//);
    expect(txt).toMatch(/Disallow:\s*\/g\//);
    expect(txt).toMatch(/Disallow:\s*\/download\//);
    expect(txt).toMatch(/Disallow:\s*\/tester-terms/);
  });

  test("names the AI scrapers explicitly (still fully blocked)", () => {
    for (const bot of ["GPTBot", "CCBot", "Google-Extended", "anthropic-ai", "ClaudeBot", "PerplexityBot", "Bytespider"]) {
      expect(txt).toContain(`User-agent: ${bot}`);
      expect(txt).toMatch(new RegExp(`User-agent:\\s*${bot}\\s*\\nDisallow:\\s*/\\s*(\\n|$)`));
    }
  });
});

describe("/tester-terms page", () => {
  const TesterTermsPage = require("@/app/tester-terms/page").default;
  const html = renderToStaticMarkup(React.createElement(TesterTermsPage));

  test("renders the no-reverse-engineering clause", () => {
    expect(html).toContain("You must not reverse engineer, decompile, disassemble, modify, copy, redistribute");
  });

  test("links to the APK with the agreement sentence", () => {
    expect(html).toContain("By downloading you agree to the tester terms.");
    expect(html).toContain('href="/download/vaira-mvp.apk"');
  });

  test("states it is not a substitute for emergency services (call 112)", () => {
    expect(html).toContain("call 112");
  });
});

describe("download + health still served", () => {
  test("/api/health still returns ok", async () => {
    const { GET } = require("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
