// ADR-043 guardian cancel-request card. Server-rendered, no client JS: the two
// votes are plain POST forms to /api/cancel-request/<id>/vote?t=<voteToken> (the
// route reads urlencoded form bodies and returns an HTML acknowledgement). There
// is no "turn the siren on" control — a guardian cannot start the siren (founder
// ruling), only say Safe / Not safe.
export function CancelRequestCard({
  requestId,
  method,
  mediaUrl,
  voteToken,
  resolved,
  verdict,
  readOnly = false,
}: {
  requestId: string;
  method: "word" | "photo" | "video";
  mediaUrl: string | null;
  voteToken: string;
  resolved: boolean;
  verdict: string | null;
  readOnly?: boolean;
}) {
  const action = `/api/cancel-request/${requestId}/vote?t=${encodeURIComponent(voteToken)}`;
  return (
    <section style={{ margin: 16, padding: 16, border: "2px solid #b91c1c", borderRadius: 12, background: "#fff" }}>
      <h2 style={{ font: "700 18px system-ui", margin: "0 0 8px" }}>She is asking you to confirm she is safe</h2>
      <p style={{ font: "14px system-ui", color: "#374151", margin: "0 0 12px" }}>
        She started a cancel request{method === "word" ? " with her journey safe word" : method === "photo" ? " with a photo" : " with a short video"}. Only say she is safe if you are sure.
      </p>
      {mediaUrl && (
        method === "video"
          ? <video src={mediaUrl} controls style={{ width: "100%", borderRadius: 8, marginBottom: 12 }} />
          : <img src={mediaUrl} alt="Her proof" style={{ width: "100%", borderRadius: 8, marginBottom: 12 }} />
      )}
      {resolved ? (
        <p style={{ font: "600 15px system-ui", color: verdict === "cancel" ? "#065f46" : "#b91c1c" }}>
          {verdict === "cancel" ? "The alarm has been cancelled." : verdict === "reraise" ? "The alarm was turned back on." : verdict === "keep" ? "The alarm is staying on." : "Your answer was recorded."}
        </p>
      ) : readOnly ? (
        <p style={{ font: "600 15px system-ui", color: "#374151", margin: 0 }}>
          Open the cancel-request message to vote
        </p>
      ) : (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <form method="post" action={action} style={{ flex: 1, minWidth: 140 }}>
            <input type="hidden" name="safe" value="true" />
            <button type="submit" style={{ width: "100%", padding: "14px", font: "700 16px system-ui", color: "#fff", background: "#065f46", border: 0, borderRadius: 8 }}>
              Safe — cancel the alarm
            </button>
          </form>
          <form method="post" action={action} style={{ flex: 1, minWidth: 140 }}>
            <input type="hidden" name="safe" value="false" />
            <button type="submit" style={{ width: "100%", padding: "14px", font: "700 16px system-ui", color: "#fff", background: "#b91c1c", border: 0, borderRadius: 8 }}>
              Not safe — keep it on
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
