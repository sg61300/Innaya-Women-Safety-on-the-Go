// Guard for the s30 guardian-pane fill (campaign page "app first" redesign).
// The guardian phone used to show one "Safe ✓" card over mostly empty white
// space. It now mirrors the REAL guardian page (g/[token]/GuardianStatus.tsx) for
// a SAFE journey. This test pins that every line is provable copy taken from that
// page, and that no em dash or invented-feature language creeps in.
import { renderToStaticMarkup } from "react-dom/server";
import { Phone } from "./Phone";

function guardianHtml() {
  return renderToStaticMarkup(
    <Phone id="phone-guardian" view="guardian" label="The guardian view: Aarohi is on her way home, live, safe." />,
  );
}

describe("Phone guardian pane (s30 fill)", () => {
  const html = guardianHtml();

  it("shows the real SAFE status strip copy", () => {
    expect(html).toContain("Safe");
    expect(html).toContain("On her way. All calm."); // stripCopy.SAFE.note
  });

  it("shows the journey overview the real page shows", () => {
    expect(html).toContain("Indiranagar"); // route label
    expect(html).toContain("Last contact just now"); // g-summary lead
    expect(html).toContain("Battery");
    expect(html).toContain("Updates");
    expect(html).toContain("Live");
  });

  it("shows last known location and the gated live-feed note", () => {
    expect(html).toContain("Last known location"); // g-map heading
    expect(html).toContain("Last seen just now"); // g-map chip
    expect(html).toContain("Her camera stays private until an emergency."); // live-gated note
  });

  it("drops the old dead-space filler copy", () => {
    expect(html).not.toContain("Nothing to do.");
  });

  it("uses no em dash (founder copy rule)", () => {
    expect(html).not.toContain("—");
  });
});
