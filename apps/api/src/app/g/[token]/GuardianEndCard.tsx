// Fix lane D5 (founder Q125): after her emergency word a guardian who has spoken to her can end
// the alarm. Two steps so it cannot be tapped by accident; no JS needed: the first step is a
// link that only opens the question (?end=1), the second posts the confirm. Plainest look on
// purpose, as the cancel card; wording is the orchestrator's reading, listed for the founder.
// Fix lane D7: closed = 4+ guardians and outside this guardian's group window: greyed, no link, no form.
export function GuardianEndCard({ token, confirming, closed = false }: { token: string; confirming: boolean; closed?: boolean }) {
  const back = `/g/${token}`;
  const btn = { display: "block", boxSizing: "border-box" as const, width: "100%", padding: "14px", font: "700 16px system-ui", textAlign: "center" as const, borderRadius: 8, textDecoration: "none" };
  return (
    <section data-testid="guardian-end" style={{ margin: 16, padding: 16, border: "2px solid #1f2937", borderRadius: 12, background: "#fff" }}>
      {closed ? (
        <>
          <div data-testid="guardian-end-closed" aria-disabled="true" style={{ ...btn, color: "#6b7280", background: "#e5e7eb", border: 0 }}>
            I have spoken to her. End the alarm
          </div>
          <p data-testid="guardian-end-closed-line" style={{ font: "400 14px system-ui", color: "#4b5563", margin: "8px 0 0" }}>
            You can't end the alarm right now. Another group of her guardians has been asked.
          </p>
        </>
      ) : confirming ? (
        <>
          <p data-testid="guardian-end-question" style={{ font: "600 16px system-ui", color: "#111827", margin: "0 0 12px" }}>
            Only do this after speaking with her yourself. End the alarm?
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <form method="post" action={`/api/guardian-end?t=${encodeURIComponent(token)}`} style={{ flex: 1, minWidth: 140 }}>
              <input type="hidden" name="confirm" value="yes" />
              <button data-testid="guardian-end-confirm" type="submit" style={{ ...btn, color: "#fff", background: "#1f2937", border: 0 }}>End</button>
            </form>
            <a data-testid="guardian-end-back" href={back} style={{ ...btn, flex: 1, minWidth: 140, color: "#1f2937", background: "#fff", border: "2px solid #1f2937" }}>Go back</a>
          </div>
        </>
      ) : (
        <a data-testid="guardian-end-start" href={`${back}?end=1`} style={{ ...btn, color: "#fff", background: "#1f2937", border: 0 }}>
          I have spoken to her. End the alarm
        </a>
      )}
    </section>
  );
}
