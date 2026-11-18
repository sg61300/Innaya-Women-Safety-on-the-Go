import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { Keyboard, AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { ThemeProvider } from "../theme";
import type { Choice } from "../theme/ThemeProvider";
import { hashWord } from "@vaira/core";

const mockReplace = jest.fn();
// T3: the screen reads ?reason via useLocalSearchParams; default to no params.
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a) },
  useLocalSearchParams: () => mockParams,
}));

// SecureStore-backed device store (real secureWords runs against this).
const mockMem: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockMem[k] ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockMem[k] = v;
  },
  deleteItemAsync: async (k: string) => {
    delete mockMem[k];
  },
}));

const mockUpsert = jest.fn().mockResolvedValue({ error: null });
const mockSingle = jest.fn().mockResolvedValue({ data: { word_salt: "salt" }, error: null });
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    from: () => ({
      upsert: (...a: unknown[]) => mockUpsert(...a),
      select: () => ({ eq: () => ({ single: () => mockSingle() }) }),
      // FD3: syncHashes now prunes stale hashes via delete().eq().eq().not().
      delete: () => ({
        eq: () => ({ eq: () => Object.assign(Promise.resolve({ error: null }), { not: () => Promise.resolve({ error: null }) }) }),
      }),
    }),
  },
}));

const mockLog = jest.fn().mockResolvedValue(undefined);
jest.mock("../lib/events", () => ({ events: { log: (...a: unknown[]) => mockLog(...a) } }));

jest.mock("expo-speech-recognition", () => ({ ExpoSpeechRecognitionModule: { requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }) } }));
jest.mock("../services/stt", () => ({ stt: { listenOnce: jest.fn().mockResolvedValue("") } }));

import SafetyWords from "../../app/(setup)/safety-words";

const renderIn = (pal: Choice = "midnight") => render(<ThemeProvider initial={pal}>{<SafetyWords />}</ThemeProvider>);
const type = (get: (id: string) => unknown, id: string, text: string) => act(async () => { fireEvent.changeText(get(id) as never, text); });
const press = (get: (id: string) => unknown, id: string) => act(async () => { fireEvent.press(get(id) as never); });

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  for (const k of Object.keys(mockMem)) delete mockMem[k];
});

const PALETTES: Choice[] = ["midnight", "rosePetal"];

// ADR-043 rule 10: the emergency password is retired. This screen now only sets
// the safety words (+ optional police keyword); there is no password field,
// validation, or banner, and no emergency_password_hash is ever written.
describe("safety-words screen", () => {
  it.each(PALETTES)("renders the mandatory ids in the %s palette", async (pal) => {
    const { getByTestId, queryByTestId } = await renderIn(pal);
    getByTestId("emergency-word-0");
    getByTestId("police-keyword");
    getByTestId("words-save");
    expect(queryByTestId("emergency-password")).toBeNull();
  });

  it("each dictation mic is labelled for its field, not the screen title", async () => {
    const { getByTestId } = await renderIn();
    const emergencyMic = getByTestId("emergency-word-0-mic");
    expect(emergencyMic.props.accessibilityLabel).toBe("Dictate Emergency word 1");
    expect(emergencyMic.props.accessibilityLabel).not.toBe("Tell us about you");
    expect(getByTestId("police-keyword-mic").props.accessibilityLabel).toBe("Dictate Police keyword");
  });

  it("save is disabled until at least one emergency word is entered", async () => {
    const { getByTestId } = await renderIn();
    expect(getByTestId("words-save").props.accessibilityState.disabled).toBe(true);
    await type(getByTestId, "emergency-word-0", "blue mango tree");
    expect(getByTestId("words-save").props.accessibilityState.disabled).toBe(false);
  });

  it("add adds up to three word fields; remove deletes one", async () => {
    const { getByTestId, queryByTestId } = await renderIn();
    await press(getByTestId, "emergency-add");
    getByTestId("emergency-word-1");
    await press(getByTestId, "emergency-add");
    getByTestId("emergency-word-2");
    expect(queryByTestId("emergency-add")).toBeNull();
    await press(getByTestId, "emergency-remove-2");
    expect(queryByTestId("emergency-word-2")).toBeNull();
  });

  it("clearing the police keyword writes an empty list to the device", async () => {
    const { getByTestId } = await renderIn();
    await type(getByTestId, "emergency-word-0", "blue mango tree");
    await type(getByTestId, "police-keyword", "");
    await press(getByTestId, "words-save");

    expect(JSON.parse(mockMem["vaira.words.police_keyword"])).toEqual([]);
  });

  it("saves device words + salted hashes, logs the event, routes to consent, and leaks no plaintext", async () => {
    const { getByTestId } = await renderIn();
    await type(getByTestId, "emergency-word-0", "blue mango tree");
    await type(getByTestId, "police-keyword", "yellow kite");
    await press(getByTestId, "words-save");

    // words persisted on device
    expect(JSON.parse(mockMem["vaira.words.emergency"])).toEqual(["blue mango tree"]);
    expect(JSON.parse(mockMem["vaira.words.police_keyword"])).toEqual(["yellow kite"]);

    // only hashes synced
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ owner_id: "u1", kind: "emergency", word_hash: hashWord("blue mango tree", "salt") }),
        expect.objectContaining({ kind: "police_keyword", word_hash: hashWord("yellow kite", "salt") }),
      ]),
      expect.anything()
    );

    const serialized = JSON.stringify(mockUpsert.mock.calls);
    expect(serialized).not.toContain("blue mango tree");
    expect(serialized).not.toContain("yellow kite");

    expect(mockLog).toHaveBeenCalledWith("safety_words_set", { count: 1 });
    expect(mockReplace).toHaveBeenCalledWith("/(setup)/consent");
  });

  it("returns to Profile with a confirmation after editing saved words", async () => {
    mockParams = { reason: "edit" };
    const { getByTestId } = await renderIn();
    await type(getByTestId, "emergency-word-0", "blue mango tree");
    await press(getByTestId, "words-save");
    expect(mockReplace).toHaveBeenCalledWith("/(user)/profile?saved=1");
  });

  // G2: word_salt is NOT NULL in the DB. If the profile row cannot be read here
  // (offline / RLS / transient) the salt is missing, and hashing with an empty
  // salt would persist un-verifiable hashes. The save must ABORT instead.
  it("aborts the save (no hash written, no route) when the profile salt cannot be read", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: null });
    const { getByTestId, findByText } = await renderIn();
    await type(getByTestId, "emergency-word-0", "blue mango tree");
    await press(getByTestId, "words-save");

    await findByText("We could not save your words. Please try again.");
    expect(mockUpsert).not.toHaveBeenCalled(); // no empty-salt safety-word hashes
    expect(mockMem["vaira.words.emergency"]).toBeUndefined(); // device untouched
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // D1(b): the keyboard must be dismissed before the replace so the consent
  // screen does not mount blank while the soft keyboard is still up.
  it("dismisses the keyboard before navigating to consent", async () => {
    const dismissSpy = jest.spyOn(Keyboard, "dismiss");
    const { getByTestId } = await renderIn();
    await type(getByTestId, "emergency-word-0", "blue mango tree");
    await press(getByTestId, "words-save");
    expect(dismissSpy).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(setup)/consent");
    expect(dismissSpy.mock.invocationCallOrder[0]).toBeLessThan(mockReplace.mock.invocationCallOrder[0]);
    dismissSpy.mockRestore();
  });

  // G3: a synchronous router.replace from the save handler raced the Fabric
  // surface remount. Defer the replace to a later commit and until the app is
  // foreground-active.
  it("defers navigation to consent until the app is foreground-active (G3)", async () => {
    const orig = Object.getOwnPropertyDescriptor(AppState, "currentState");
    let fire: ((s: string) => void) | null = null;
    const addSpy = jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, cb: (s: string) => void) => {
      fire = cb;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    }) as never);
    Object.defineProperty(AppState, "currentState", { configurable: true, get: () => "background" });
    try {
      const { getByTestId } = await renderIn();
      await type(getByTestId, "emergency-word-0", "blue mango tree");
      await press(getByTestId, "words-save");
      // Save has completed, but navigation is held while the app is backgrounded.
      expect(mockReplace).not.toHaveBeenCalled();
      await act(async () => {
        fire?.("active");
      });
      expect(mockReplace).toHaveBeenCalledWith("/(setup)/consent");
    } finally {
      addSpy.mockRestore();
      if (orig) Object.defineProperty(AppState, "currentState", orig);
    }
  });

  it("a failed server sync never writes the device and surfaces the error", async () => {
    const setSpy = jest.spyOn(SecureStore, "setItemAsync");
    mockUpsert.mockResolvedValueOnce({ error: { message: "boom" } });
    const { getByTestId, findByText } = await renderIn();
    await type(getByTestId, "emergency-word-0", "blue mango tree");
    await press(getByTestId, "words-save");
    await findByText("We could not save your words. Please try again.");
    expect(setSpy).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("prefills previously saved words when opened from Profile edit", async () => {
    mockParams = { reason: "edit" };
    mockMem["vaira.words.emergency"] = JSON.stringify(["blue mango tree", "silver fox"]);
    mockMem["vaira.words.police_keyword"] = JSON.stringify(["yellow kite"]);
    const { getByTestId } = await renderIn();
    await act(async () => {});
    expect((getByTestId("emergency-word-0") as any).props.value).toBe("blue mango tree");
    expect((getByTestId("emergency-word-1") as any).props.value).toBe("silver fox");
    expect((getByTestId("police-keyword") as any).props.value).toBe("yellow kite");
  });

  it("does not prefill in the normal (no-reason) flow", async () => {
    mockMem["vaira.words.emergency"] = JSON.stringify(["blue mango tree"]);
    const { getByTestId } = await renderIn();
    await act(async () => {});
    expect((getByTestId("emergency-word-0") as any).props.value).toBe("");
  });

  it("writes the device only after the server sync succeeds", async () => {
    const setSpy = jest.spyOn(SecureStore, "setItemAsync");
    const { getByTestId } = await renderIn();
    await type(getByTestId, "emergency-word-0", "blue mango tree");
    await press(getByTestId, "words-save");
    expect(setSpy).toHaveBeenCalled();
    expect(mockUpsert.mock.invocationCallOrder[0]).toBeLessThan(setSpy.mock.invocationCallOrder[0]);
  });
});
