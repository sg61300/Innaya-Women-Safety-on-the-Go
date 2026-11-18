import React from "react";
import { render, fireEvent, act, within } from "@testing-library/react-native";
import { ThemeProvider, deriveTokens, palettes, isDarkPalette, contrastRatio, blend, toHex } from "../theme";
import type { PaletteKey } from "../theme/palettes";
import type { Choice } from "../theme/ThemeProvider";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }));

const mockSaveProfile = jest.fn().mockResolvedValue(undefined);
jest.mock("../services/profile", () => ({ saveProfile: (...a: unknown[]) => mockSaveProfile(...a) }));

const mockListenOnce = jest.fn();
jest.mock("../services/stt", () => ({ stt: { listenOnce: (...a: unknown[]) => mockListenOnce(...a) } }));

const mockGetUser = jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } });
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: () => ({ update: () => ({ eq: jest.fn().mockResolvedValue({ error: null }) }) }),
    storage: { from: () => ({ upload: jest.fn().mockResolvedValue({ error: null }) }) },
  },
}));

const mockRequestPerm = jest.fn().mockResolvedValue({ granted: true });
jest.mock("expo-speech-recognition", () => ({ ExpoSpeechRecognitionModule: { requestPermissionsAsync: () => mockRequestPerm() } }));
jest.mock("expo-speech", () => ({ speak: jest.fn() }));
jest.mock("expo-contacts", () => ({ requestPermissionsAsync: jest.fn(), Contact: { presentPicker: jest.fn() } }));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import Profile from "../../app/(setup)/profile";

// This project's RNTL render resolves a promise (concurrent root); await it.
const renderIn = (pal: Choice = "midnight") => render(<ThemeProvider initial={pal}>{<Profile />}</ThemeProvider>);
const type = (get: (id: string) => unknown, id: string, text: string) => act(async () => { fireEvent.changeText(get(id) as never, text); });
const press = (get: (id: string) => unknown, id: string) => act(async () => { fireEvent.press(get(id) as never); });

// Clear the autosaved draft so each test mounts a clean form (the profile screen
// restores vaira.profile.draft from AsyncStorage, which otherwise bleeds between tests).
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

const PALETTES: Choice[] = ["midnight", "goldenIvory"];

describe("profile screen", () => {
  it.each(PALETTES)("renders in the %s palette with the mandatory ids", async (pal) => {
    const { getByTestId } = await renderIn(pal);
    getByTestId("profile-name");
    getByTestId("profile-age");
    getByTestId("contact-add-manual");
    getByTestId("profile-save");
  });

  it("blocks save and shows a validation error when required fields are empty", async () => {
    const { getByTestId, findByText } = await renderIn();
    await act(async () => {});
    await press(getByTestId, "profile-save");
    await findByText("Name is required");
    expect(mockSaveProfile).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("add-manual creates a contact row; remove deletes it", async () => {
    const { getByTestId, queryByTestId } = await renderIn();
    await act(async () => {});
    await press(getByTestId, "contact-add-manual");
    getByTestId("contact-name-0");
    getByTestId("contact-phone-0");
    expect(getByTestId("contact-email-0").props.accessibilityLabel).toBe("Email");
    await press(getByTestId, "contact-remove-0");
    expect(queryByTestId("contact-name-0")).toBeNull();
  });

  it("saves valid input, upserts via saveProfile and routes to safety-words", async () => {
    const { getByTestId } = await renderIn();
    await act(async () => {});
    await type(getByTestId, "profile-name", "Priya Test");
    await type(getByTestId, "profile-age", "28");
    await press(getByTestId, "profile-occupation-Student");
    await press(getByTestId, "contact-add-manual");
    await type(getByTestId, "contact-name-0", "Amma");
    await type(getByTestId, "contact-phone-0", "9876500000");
    await press(getByTestId, "profile-save");
    expect(mockSaveProfile).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ name: "Priya Test", age: 28, occupation: "Student", contacts: [expect.objectContaining({ phone: "9876500000", tier: "primary" })] })
    );
    expect(mockReplace).toHaveBeenCalledWith("/(setup)/safety-words");
  });

  it("voice fill requests permission then writes the transcript into the empty name field", async () => {
    mockListenOnce.mockResolvedValue("Meera");
    const { getByTestId } = await renderIn();
    await act(async () => {});
    await press(getByTestId, "voice-fab");
    expect(mockRequestPerm).toHaveBeenCalled();
    expect(getByTestId("profile-name").props.value).toBe("Meera");
  });

  // F1: the survey is optional and always shown (no Skip button, which reset the
  // form on device). The how-heard field renders and there is no survey-skip.
  it("shows the optional survey field with no skip button", async () => {
    const { getByTestId, queryByTestId } = await renderIn();
    await act(async () => {});
    getByTestId("profile-how-heard");
    expect(queryByTestId("survey-skip")).toBeNull();
  });

  // D7 (structural — pure layout, cannot be RED via behaviour): the screen
  // reserves bottom space below Save so the floating mic FAB (52dp) clears it.
  it("reserves bottom-right space so the mic FAB does not overlap Save", async () => {
    const { getByTestId } = await renderIn();
    await act(async () => {});
    const style = getByTestId("profile-fab-inset").props.style as { height?: number } | Array<{ height?: number }>;
    const height = Array.isArray(style) ? style.find((s) => s && s.height)?.height : style?.height;
    expect(height).toBeGreaterThanOrEqual(64);
  });

});

// Colour of the first style entry a <Text> resolves to (variant + color merge).
const textColor = (node: { props: Record<string, unknown> }): string => {
  const s = node.props.style as { color?: string } | Array<{ color?: string }>;
  return (Array.isArray(s) ? s[0]?.color : s?.color) as string;
};

// F1: the selected occupation and contact-tier pills must carry the guarded
// d.chip.brand.fg over d.chip.brand.bg — never unguarded p.brand — and pass 4.5:1
// in every palette (blushLavender/oceanMist/sakuraDawn were the failing three).
describe("profile selected pills use the contrast-guarded brand chip (F1)", () => {
  const ALL = Object.keys(palettes) as PaletteKey[];
  it.each(ALL)("occupation pill passes 4.5:1 and uses d.chip.brand in %s", async (pal) => {
    const d = deriveTokens(palettes[pal], isDarkPalette(pal));
    const { getByTestId, getByText } = await renderIn(pal);
    await act(async () => {});
    await press(getByTestId, "profile-occupation-Student");
    const color = textColor(getByText("Student"));
    expect(color).toBe(d.chip.brand.fg);
    const bg = toHex(blend(d.chip.brand.bg, palettes[pal].bgCard));
    // Wherever raw p.brand would fail 4.5:1 (blushLavender/oceanMist/sakuraDawn), the
    // rendered colour must be the guarded token instead — never the unguarded brand.
    if (contrastRatio(palettes[pal].brand, bg) < 4.5) expect(color).not.toBe(palettes[pal].brand);
    expect(contrastRatio(color, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ALL)("contact-tier pill passes 4.5:1 and uses d.chip.brand in %s", async (pal) => {
    const d = deriveTokens(palettes[pal], isDarkPalette(pal));
    const { getByTestId } = await renderIn(pal);
    await act(async () => {});
    await press(getByTestId, "contact-add-manual");
    const pill = getByTestId("contact-tier-primary-0");
    const color = textColor(within(pill).getByText("Emergency"));
    expect(color).toBe(d.chip.brand.fg);
    const bg = toHex(blend(d.chip.brand.bg, palettes[pal].bgCard));
    if (contrastRatio(palettes[pal].brand, bg) < 4.5) expect(color).not.toBe(palettes[pal].brand);
    expect(contrastRatio(color, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

// F2: the Self-defence training and Tools sections must exist and flow through
// to saveProfile — brief Task 19 §3.7 enumerates both.
describe("profile collects self-defence training and tools (F2)", () => {
  it("renders both sections and reveals training detail fields when trained", async () => {
    const { getByTestId, queryByTestId } = await renderIn();
    await act(async () => {});
    getByTestId("profile-trained-yes");
    getByTestId("profile-trained-no");
    getByTestId("profile-tool-Pepper spray");
    expect(queryByTestId("profile-discipline")).toBeNull();
    await press(getByTestId, "profile-trained-yes");
    getByTestId("profile-discipline");
    getByTestId("profile-level");
    getByTestId("profile-duration");
  });

  it("passes selfDefence and tools through to saveProfile", async () => {
    const { getByTestId } = await renderIn();
    await act(async () => {});
    await type(getByTestId, "profile-name", "Priya Test");
    await type(getByTestId, "profile-age", "28");
    await press(getByTestId, "profile-occupation-Student");
    await press(getByTestId, "profile-trained-yes");
    await type(getByTestId, "profile-discipline", "Karate");
    await press(getByTestId, "profile-tool-Pepper spray");
    await press(getByTestId, "contact-add-manual");
    await type(getByTestId, "contact-name-0", "Amma");
    await type(getByTestId, "contact-phone-0", "9876500000");
    await press(getByTestId, "profile-save");
    expect(mockSaveProfile).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        selfDefence: expect.objectContaining({ trained: true, discipline: "Karate" }),
        tools: ["Pepper spray"],
      })
    );
  });

  it("omits selfDefence when the training question is unanswered", async () => {
    const { getByTestId } = await renderIn();
    await act(async () => {});
    await type(getByTestId, "profile-name", "Priya Test");
    await type(getByTestId, "profile-age", "28");
    await press(getByTestId, "profile-occupation-Student");
    await press(getByTestId, "contact-add-manual");
    await type(getByTestId, "contact-name-0", "Amma");
    await type(getByTestId, "contact-phone-0", "9876500000");
    await press(getByTestId, "profile-save");
    const arg = mockSaveProfile.mock.calls[0][1] as Record<string, unknown>;
    expect(arg.selfDefence).toBeUndefined();
    expect(arg.tools).toBeUndefined();
  });
});

// D5/D6: contact-row errors must be rendered (they silently blocked Save), and
// the raw zod messages for occupation/age must be mapped to friendly copy.
describe("profile form validation messages (D5/D6)", () => {
  it("D5: renders a contact-row error when a contact phone is empty", async () => {
    const { getByTestId, findByText } = await renderIn();
    await act(async () => {});
    await type(getByTestId, "profile-name", "Priya");
    await type(getByTestId, "profile-age", "28");
    await press(getByTestId, "profile-occupation-Student");
    await press(getByTestId, "contact-add-manual");
    await type(getByTestId, "contact-name-0", "Amma");
    // phone left empty
    await press(getByTestId, "profile-save");
    await findByText("Enter a 10-digit Indian mobile number");
    expect(mockSaveProfile).not.toHaveBeenCalled();
  });

  it("D6: maps the empty-occupation zod error to friendly copy", async () => {
    const { getByTestId, findByText, queryByText } = await renderIn();
    await act(async () => {});
    await type(getByTestId, "profile-name", "Priya");
    await type(getByTestId, "profile-age", "28");
    // occupation left unchosen
    await press(getByTestId, "contact-add-manual");
    await type(getByTestId, "contact-name-0", "Amma");
    await type(getByTestId, "contact-phone-0", "9876500000");
    await press(getByTestId, "profile-save");
    await findByText("Please choose what best describes you.");
    expect(queryByText(/Invalid enum value/)).toBeNull();
  });

  it("D6: maps an empty age to an age-required message, not the raw zod text", async () => {
    const { getByTestId, findByText, queryByText } = await renderIn();
    await act(async () => {});
    await type(getByTestId, "profile-name", "Priya");
    // age left empty
    await press(getByTestId, "profile-occupation-Student");
    await press(getByTestId, "contact-add-manual");
    await type(getByTestId, "contact-name-0", "Amma");
    await type(getByTestId, "contact-phone-0", "9876500000");
    await press(getByTestId, "profile-save");
    await findByText("Age is required.");
    expect(queryByText("Numbers only, please")).toBeNull();
  });
});

// R5: an error set by Save must clear the moment the field is corrected — the
// user must not have to submit a second time to make it disappear.
describe("profile clears a field error when it is corrected (R5)", () => {
  it("age-required error disappears after typing the age, without another submit", async () => {
    const { getByTestId, findByText, queryByText } = await renderIn();
    await act(async () => {});
    await type(getByTestId, "profile-name", "Priya");
    await press(getByTestId, "profile-occupation-Student");
    await press(getByTestId, "contact-add-manual");
    await type(getByTestId, "contact-name-0", "Amma");
    await type(getByTestId, "contact-phone-0", "9876500000");
    // age left empty → submit surfaces the error
    await press(getByTestId, "profile-save");
    await findByText("Age is required.");
    // correct the field only — no second Save
    await type(getByTestId, "profile-age", "28");
    expect(queryByText("Age is required.")).toBeNull();
    expect(mockSaveProfile).not.toHaveBeenCalled();
  });
});

// D4: the autosaved draft must not clobber the user's input, and a fully empty
// contact row is never persisted. Kept last: these drive a late-resolving
// AsyncStorage read, so they run after the palette-contrast suites above.
describe("profile draft autosave (D4)", () => {
  it("does not persist a fully empty contact row", async () => {
    const setSpy = jest.spyOn(AsyncStorage, "setItem");
    const { getByTestId, unmount } = await renderIn();
    await act(async () => {});
    await press(getByTestId, "contact-add-manual");
    await type(getByTestId, "profile-name", "Priya");
    const persisted = setSpy.mock.calls
      .filter((c) => c[0] === "vaira.profile.draft")
      .map((c) => String(c[1]));
    expect(persisted.length).toBeGreaterThan(0);
    for (const body of persisted) expect(JSON.parse(body).contacts).toEqual([]);
    unmount();
    setSpy.mockRestore();
  });

  // Last test in the file: it holds an AsyncStorage read pending and resolves it
  // late, which leaves a concurrent-root microtask that would surface as an
  // AggregateError in a subsequent render — so nothing must render after it.
  it("a draft that resolves after the user starts typing does not clobber their input", async () => {
    let resolveGet: (v: string | null) => void = () => {};
    // Hold only the draft read pending; other reads (e.g. ThemeProvider's palette)
    // resolve to null so the theme still initialises from `initial`.
    const getSpy = jest.spyOn(AsyncStorage, "getItem").mockImplementation((k: string) =>
      k === "vaira.profile.draft" ? new Promise<string | null>((r) => { resolveGet = r; }) : Promise.resolve(null)
    );
    try {
      const { getByTestId, unmount } = await renderIn();
      await type(getByTestId, "profile-name", "New Name");
      // The stored draft (an older name) lands only now, after the keystroke.
      await act(async () => { resolveGet(JSON.stringify({ name: "Old Draft", age: "40" })); });
      expect(getByTestId("profile-name").props.value).toBe("New Name");
      unmount();
    } finally {
      getSpy.mockRestore();
    }
  });
});
