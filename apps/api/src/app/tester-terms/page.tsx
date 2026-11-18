import type { Metadata } from "next";

// Full tester terms, server-rendered, no client JS. Linked from the in-app gate
// (mobile TesterTerms screen) and from the APK download. Text mirrors the vault
// draft Legal/02-tester-terms.md (DRAFT — lawyer review is a pre-launch gate).
export const metadata: Metadata = {
  title: "INNAYA Tester terms",
  robots: { index: false, follow: false },
};

const CLAUSES: { h: string; p: React.ReactNode }[] = [
  {
    h: "1. What this is",
    p: "INNAYA is an early test build (the “MVP”). You are a volunteer tester. These Tester Terms cover your testing only; they are additional to, and do not replace, the app’s Terms of Use and Consent Framework, which you also accept when you use the app.",
  },
  {
    h: "2. Test purpose only",
    p: "You may use this build only to try it out and give feedback. It is not a finished product and must not be relied on as your only means of getting help.",
  },
  {
    h: "3. Confidentiality",
    p: "The app, its screens, flows, designs, unreleased features and any other non-public information you see during testing are confidential. Do not publish screenshots or recordings of the app, and do not share the build or what you learn from it with anyone, until we release it publicly.",
  },
  {
    h: "4. No reverse engineering",
    p: "You must not reverse engineer, decompile, disassemble, modify, copy, redistribute, or create derivative works from the app or any part of it.",
  },
  {
    h: "5. No warranty; safety features may fail",
    p: (
      <>
        The app is provided &ldquo;as is&rdquo;, with no warranty of any kind. Detection, alerts and sharing can be
        wrong or can fail because of your network, battery, permissions, phone settings or human availability.{" "}
        <strong>INNAYA is not a substitute for the emergency services. In an emergency call 112.</strong>
      </>
    ),
  },
  {
    h: "6. Your data",
    p: "We handle your data as described in the in-app consent and privacy notice. Camera frames are masked on your device before any are sent (your face pixelated, other faces and number plates blurred). You can ask us to delete your data, including data already used to improve our models. We do not share your data with anyone except law enforcement when required through proper legal channels.",
  },
  {
    h: "7. Feedback",
    p: "If you send us feedback, bug reports or suggestions, you grant us a free, worldwide, perpetual, irrevocable licence to use them to improve INNAYA, with no obligation to you.",
  },
  {
    h: "8. Governing law",
    p: "These Tester Terms are governed by the laws of India.",
  },
  {
    h: "9. Termination",
    p: "You may stop testing at any time by deleting the app; ask us to delete your data if you wish. We may end your access to the test at any time. Clauses 3, 4, 5, 6, 7 and 8 continue to apply after testing ends.",
  },
];

export default function TesterTermsPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 20px 80px",
        color: "#E9E9EC",
        background: "#0B0B0C",
        minHeight: "100vh",
        fontFamily: "Inter, system-ui, sans-serif",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>INNAYA Tester terms</h1>
      <p style={{ color: "#A0A0A8", marginTop: 0 }}>
        Version <code>tester-terms-2026-09-24</code>. Draft — under legal review. By using this test build you agree to
        these terms.
      </p>

      {CLAUSES.map((c) => (
        <section key={c.h} style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>{c.h}</h2>
          <p style={{ margin: 0, color: "#C9C9CF" }}>{c.p}</p>
        </section>
      ))}

      <hr style={{ borderColor: "#2A2A2E", margin: "40px 0 24px" }} />

      <p style={{ color: "#C9C9CF" }}>By downloading you agree to the tester terms.</p>
      <p>
        <a
          href="/download/vaira-mvp.apk"
          style={{
            display: "inline-block",
            padding: "12px 20px",
            borderRadius: 10,
            background: "#6D5AE6",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Download the INNAYA MVP (APK)
        </a>
      </p>
    </main>
  );
}
