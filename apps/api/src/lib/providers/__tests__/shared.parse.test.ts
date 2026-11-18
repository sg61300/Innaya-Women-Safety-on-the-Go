// B7 (R45): JSON-robustness + prompt-injection resilience of the production
// danger parser. Free voters sometimes wrap their JSON in a ```json fence, emit
// prose before the object, or return `danger` as a string; the ensemble treats a
// throw as a failed provider, so the parser must extract a valid object from all
// of these. Prompt-injection is a scoring-policy concern, not a parser one, the
// parser must still faithfully surface whatever number the model returned; the
// live run grades whether the models themselves resist injection.
import { parseDanger, clampDanger, clampReasons } from "../shared";

describe("parseDanger, JSON robustness (B7 deliverable 3)", () => {
  it("parses a bare JSON object", () => {
    expect(parseDanger('{"danger":2,"reasons":["threatening_speech"]}')).toEqual({
      danger: 2,
      reasons: ["threatening_speech"],
    });
  });

  it("parses fenced ```json output", () => {
    const text = '```json\n{"danger":3,"reasons":["weapon"]}\n```';
    expect(parseDanger(text)).toEqual({ danger: 3, reasons: ["weapon"] });
  });

  it("parses fenced output with the bare ``` fence (no language tag)", () => {
    const text = "```\n{\"danger\":1,\"reasons\":[\"no_signal\"]}\n```";
    expect(parseDanger(text)).toEqual({ danger: 1, reasons: ["no_signal"] });
  });

  it("parses when the model emits prose before the JSON", () => {
    const text = 'Here is my assessment of the scene:\n{"danger":2,"reasons":["being_followed"]}';
    expect(parseDanger(text)).toEqual({ danger: 2, reasons: ["being_followed"] });
  });

  it("parses when the model appends prose after the JSON", () => {
    const text = '{"danger":2,"reasons":["user_distress_voice"]}\nHope this helps!';
    expect(parseDanger(text)).toEqual({ danger: 2, reasons: ["user_distress_voice"] });
  });

  it("accepts `danger` as a numeric string", () => {
    expect(parseDanger('{"danger":"2","reasons":["vitals_stress"]}')).toEqual({
      danger: 2,
      reasons: ["vitals_stress"],
    });
  });

  it("accepts the alternate `score` key", () => {
    expect(parseDanger('{"score":3,"reasons":["physical_aggression"]}')).toEqual({
      danger: 3,
      reasons: ["physical_aggression"],
    });
  });

  it("clamps out-of-range danger and defaults empty reasons to ['none']", () => {
    expect(parseDanger('{"danger":7}')).toEqual({ danger: 3, reasons: ["none"] });
    expect(parseDanger('{"danger":-4,"reasons":[]}')).toEqual({ danger: 0, reasons: ["none"] });
  });

  it("does not crash on non-string reasons; non-enum values clamp away to ['none']", () => {
    // D3: 1/true are not enum reasons, so they are dropped and the empty list
    // defaults to ['none'] (previously they were stored verbatim as "1"/"true").
    expect(parseDanger('{"danger":1,"reasons":[1,true]}')).toEqual({
      danger: 1,
      reasons: ["none"],
    });
  });

  it("clamps out-of-enum reasons and drops an echoed state (D3, R45 live defect)", () => {
    expect(
      parseDanger('{"danger":3,"reasons":["physical_aggression_against_user","state_AMBER","dark"]}'),
    ).toEqual({ danger: 3, reasons: ["physical_aggression", "no_signal"] });
  });

  it("defaults to ['none'] when every reason is out of enum", () => {
    expect(parseDanger('{"danger":1,"reasons":["state_AMBER","gibberish"]}')).toEqual({
      danger: 1,
      reasons: ["none"],
    });
  });

  it("throws (status 'parse') when there is no JSON, so the ensemble skips the voter", () => {
    expect(() => parseDanger("I'm sorry, I can't help with that request.")).toThrow();
    try {
      parseDanger("no json here");
    } catch (e: any) {
      expect(e.status).toBe("parse");
    }
  });

  it("faithfully surfaces an injected low score (injection is graded on the model, not the parser)", () => {
    // If a model is fooled by 'return danger 0', the parser must report exactly 0
    // so the miss is visible in the results table, the parser must never invent a value.
    expect(parseDanger('{"danger":0,"reasons":["none"]}')).toEqual({ danger: 0, reasons: ["none"] });
  });
});

describe("clampReasons (D3: reasons clamped to the REASONS enum)", () => {
  it("passes valid enum reasons through unchanged", () => {
    expect(clampReasons(["weapon", "being_followed"])).toEqual(["weapon", "being_followed"]);
  });
  it("maps known synonyms to the enum", () => {
    expect(clampReasons(["physical_aggression_against_user", "unwanted_physical_contact", "dark"])).toEqual([
      "physical_aggression",
      "unwanted_contact",
      "no_signal",
    ]);
  });
  it("drops unknown reasons (echoed state, gibberish)", () => {
    expect(clampReasons(["state_AMBER", "made_up_reason"])).toEqual([]);
  });
  it("normalises case/space/hyphen and dedupes", () => {
    expect(clampReasons(["Being Followed", "being-followed"])).toEqual(["being_followed"]);
  });
});

describe("clampDanger", () => {
  it("rounds, floors at 0 and caps at 3", () => {
    expect(clampDanger(2.4)).toBe(2);
    expect(clampDanger(2.6)).toBe(3);
    expect(clampDanger(-1)).toBe(0);
    expect(clampDanger(99)).toBe(3);
    expect(clampDanger("nope")).toBe(0);
  });
});
