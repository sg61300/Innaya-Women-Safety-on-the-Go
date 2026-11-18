import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { Keyboard } from "react-native";
import { ThemeProvider } from "../theme";
import type { Choice } from "../theme/ThemeProvider";

// ---- router mock (functions read lazily; jest.mock hoists above the consts) ----
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
    back: (...a: unknown[]) => mockBack(...a),
  },
  useLocalSearchParams: () => mockParams,
}));

// ---- supabase mock ----
const mockSignUp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockResend = jest.fn();
const mockSignIn = jest.fn();
const mockOAuth = jest.fn();
const mockRpc = jest.fn();
const mockResetPw = jest.fn();
const mockUpdateUser = jest.fn();
// The signup post-verify path awaits events.flush(), which calls
// supabase.from("events").insert(...). Provide a chainable from() so that
// bootstrap resolves instead of throwing "from is not a function".
const mockInsert = jest.fn(async (..._a: unknown[]) => ({ error: null }));
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: (...a: unknown[]) => mockSignUp(...a),
      verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
      resend: (...a: unknown[]) => mockResend(...a),
      signInWithPassword: (...a: unknown[]) => mockSignIn(...a),
      signInWithOAuth: (...a: unknown[]) => mockOAuth(...a),
      resetPasswordForEmail: (...a: unknown[]) => mockResetPw(...a),
      updateUser: (...a: unknown[]) => mockUpdateUser(...a),
    },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (_t: string) => ({ insert: (...a: unknown[]) => mockInsert(...a) }),
  },
}));

// BrandLockup runs an async reduce-motion read + a looping animation that keep
// act() open under the concurrent test root; it is decorative and covered by its
// own test (BrandLockup.test.tsx). Stub it here so the form logic tests are clean.
jest.mock("../components/BrandLockup", () => ({ BrandLockup: () => null }));

import Signup from "../../app/(auth)/signup";
import Login from "../../app/(auth)/login";
import Otp from "../../app/(auth)/otp";
import Reset from "../../app/(auth)/reset";

const PALETTES: Choice[] = ["midnight", "violetBloom"];
const renderIn = (ui: React.ReactElement, palette: Choice = "midnight") =>
  render(<ThemeProvider initial={palette}>{ui}</ThemeProvider>);

// Under the concurrent test root, controlled-input commits and async event
// handlers settle on a later microtask. Driving each interaction inside an async
// act() flushes those updates within a single act scope — the RNTL-recommended
// pattern for async handlers — so nothing leaks into the next test.
const type = (getByTestId: (id: string) => unknown, id: string, text: string) =>
  act(async () => {
    fireEvent.changeText(getByTestId(id) as never, text);
  });
const press = (getByTestId: (id: string) => unknown, id: string) =>
  act(async () => {
    fireEvent.press(getByTestId(id) as never);
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe("signup", () => {
  it.each(PALETTES)("renders in the %s palette without crashing", async (pal) => {
    const { getByTestId } = await renderIn(<Signup />, pal);
    getByTestId("signup-email");
    getByTestId("signup-submit");
  });

  it("shows a validation error for a bad phone and blocks submit", async () => {
    const { getByTestId, findByText } = await renderIn(<Signup />);
    await type(getByTestId, "signup-phone", "1234");
    await findByText("Enter a 10-digit Indian mobile number");
    await press(getByTestId, "signup-submit");
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("submits valid input and routes to OTP", async () => {
    mockSignUp.mockResolvedValue({ error: null });
    const { getByTestId } = await renderIn(<Signup />);
    await type(getByTestId, "signup-email", "a@b.com");
    await type(getByTestId, "signup-phone", "9876543210");
    await type(getByTestId, "signup-password", "abcdefg1");
    await type(getByTestId, "signup-confirm", "abcdefg1");
    await press(getByTestId, "signup-submit");
    expect(mockSignUp).toHaveBeenCalledWith({ email: "a@b.com", password: "abcdefg1", options: { data: { phone: "9876543210" } } });
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/(auth)/otp", params: { email: "a@b.com", type: "signup" } });
  });

  it("maps an already-registered error to the friendly message", async () => {
    mockSignUp.mockResolvedValue({ error: { message: "User already registered" } });
    const { getByTestId, findByText } = await renderIn(<Signup />);
    await type(getByTestId, "signup-email", "a@b.com");
    await type(getByTestId, "signup-phone", "9876543210");
    await type(getByTestId, "signup-password", "abcdefg1");
    await type(getByTestId, "signup-confirm", "abcdefg1");
    await press(getByTestId, "signup-submit");
    await findByText("Email already used. Log in instead.");
    expect(mockPush).not.toHaveBeenCalled();
  });

  // F5: an already-registered email returns success with an EMPTY identities array
  // and no OTP is sent. Show the emailUsed message and do NOT navigate to OTP.
  it("empty-identities response (already-registered email) shows emailUsed and does not navigate", async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: "u1", identities: [] } }, error: null });
    const { getByTestId, findByText } = await renderIn(<Signup />);
    await type(getByTestId, "signup-email", "a@b.com");
    await type(getByTestId, "signup-phone", "9876543210");
    await type(getByTestId, "signup-password", "abcdefg1");
    await type(getByTestId, "signup-confirm", "abcdefg1");
    await press(getByTestId, "signup-submit");
    await findByText("Email already used. Log in instead.");
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("login", () => {
  it.each(PALETTES)("renders in the %s palette", async (pal) => {
    const { getByTestId } = await renderIn(<Login />, pal);
    getByTestId("login-submit");
  });

  it("email identifier signs in directly and routes to root", async () => {
    mockSignIn.mockResolvedValue({ error: null });
    const { getByTestId } = await renderIn(<Login />);
    await type(getByTestId, "login-identifier", "a@b.com");
    await type(getByTestId, "login-password", "secret12");
    await press(getByTestId, "login-submit");
    expect(mockSignIn).toHaveBeenCalledWith({ email: "a@b.com", password: "secret12" });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  // D1 (s09 security): phone login is disabled — email_for_phone is a
  // SECURITY DEFINER lookup that must not be reachable from the client, so the
  // phone path never calls the RPC; it asks the user to log in by email.
  it("phone identifier is blocked with a use-email message and never calls the RPC", async () => {
    const { getByTestId, findByText } = await renderIn(<Login />);
    await type(getByTestId, "login-identifier", "9876543210");
    await type(getByTestId, "login-password", "secret12");
    await press(getByTestId, "login-submit");
    await findByText("Log in with your email for now");
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows an error on bad credentials", async () => {
    mockSignIn.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const { getByTestId, findByText } = await renderIn(<Login />);
    await type(getByTestId, "login-identifier", "a@b.com");
    await type(getByTestId, "login-password", "secret12");
    await press(getByTestId, "login-submit");
    await findByText("We couldn't sign you in. Check your details and try again.");
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("otp", () => {
  it("auto-submits six digits and routes to permissions on signup", async () => {
    mockParams = { email: "a@b.com", type: "signup" };
    mockVerifyOtp.mockResolvedValue({ error: null });
    const { getByTestId } = await renderIn(<Otp />);
    await type(getByTestId, "otp-input", "123456");
    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: "a@b.com", token: "123456", type: "signup" });
    expect(mockReplace).toHaveBeenCalledWith("/(setup)/permissions");
  });

  // D8: the OTP soft keyboard must be dismissed before the post-verify navigation
  // so it does not persist onto the permissions screen.
  it("dismisses the keyboard before navigating after a successful verify", async () => {
    mockParams = { email: "a@b.com", type: "signup" };
    mockVerifyOtp.mockResolvedValue({ error: null });
    const dismissSpy = jest.spyOn(Keyboard, "dismiss");
    const { getByTestId } = await renderIn(<Otp />);
    await type(getByTestId, "otp-input", "123456");
    expect(dismissSpy).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(setup)/permissions");
    expect(dismissSpy.mock.invocationCallOrder[0]).toBeLessThan(mockReplace.mock.invocationCallOrder[0]);
    dismissSpy.mockRestore();
  });

  it("routes recovery verification to the reset new-password stage", async () => {
    mockParams = { email: "a@b.com", type: "recovery" };
    mockVerifyOtp.mockResolvedValue({ error: null });
    const { getByTestId } = await renderIn(<Otp />);
    await type(getByTestId, "otp-input", "123456");
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/(auth)/reset", params: { stage: "new" } });
  });

  it("shows an error and clears the field on a bad code", async () => {
    mockParams = { email: "a@b.com", type: "signup" };
    mockVerifyOtp.mockResolvedValue({ error: { message: "Token has expired" } });
    const { getByTestId, findByText } = await renderIn(<Otp />);
    await type(getByTestId, "otp-input", "123456");
    await findByText("That code didn't work. Check it and try again.");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // D3 (s09): a recovery OTP must be re-sent through resetPasswordForEmail,
  // not auth.resend({type:"signup"}) which would send a signup confirmation.
  it("resend on a recovery OTP re-sends via resetPasswordForEmail, not signup resend", async () => {
    jest.useFakeTimers();
    try {
      mockParams = { email: "a@b.com", type: "recovery" };
      mockResetPw.mockResolvedValue({ error: null });
      const { getByTestId } = await renderIn(<Otp />);
      await act(async () => { jest.advanceTimersByTime(30000); });
      await act(async () => { fireEvent.press(getByTestId("otp-resend") as never); });
      expect(mockResetPw).toHaveBeenCalledWith("a@b.com");
      expect(mockResend).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("resend on a signup OTP still re-sends the signup code", async () => {
    jest.useFakeTimers();
    try {
      mockParams = { email: "a@b.com", type: "signup" };
      mockResend.mockResolvedValue({ error: null });
      const { getByTestId } = await renderIn(<Otp />);
      await act(async () => { jest.advanceTimersByTime(30000); });
      await act(async () => { fireEvent.press(getByTestId("otp-resend") as never); });
      expect(mockResend).toHaveBeenCalledWith({ type: "signup", email: "a@b.com" });
      expect(mockResetPw).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  // F7 (founder live test): a failed/rate-limited resend must be surfaced, not
  // swallowed — previously the error was discarded and read as "OTP did not come".
  it("resend failure surfaces an error instead of failing silently", async () => {
    jest.useFakeTimers();
    try {
      mockParams = { email: "a@b.com", type: "signup" };
      mockResend.mockResolvedValue({ error: { message: "email rate limit exceeded" } });
      const { getByTestId, findByText } = await renderIn(<Otp />);
      await act(async () => { jest.advanceTimersByTime(30000); }); // clear the cooldown
      await act(async () => { fireEvent.press(getByTestId("otp-resend") as never); });
      expect(mockResend).toHaveBeenCalledWith({ type: "signup", email: "a@b.com" });
      jest.useRealTimers();
      await findByText("We could not resend the code just now. Please wait a moment and try again.");
    } finally {
      jest.useRealTimers();
    }
  });

  describe("E2E bypass hook (R22)", () => {
    const OLD = process.env.EXPO_PUBLIC_E2E;
    afterEach(() => { process.env.EXPO_PUBLIC_E2E = OLD; });

    it("with EXPO_PUBLIC_E2E=1, code 000000 confirms via the e2e_confirm RPC", async () => {
      process.env.EXPO_PUBLIC_E2E = "1";
      mockParams = { email: "a@b.com", type: "signup" };
      mockRpc.mockResolvedValue({ error: null });
      const { getByTestId } = await renderIn(<Otp />);
      await type(getByTestId, "otp-input", "000000");
      expect(mockRpc).toHaveBeenCalledWith("e2e_confirm", { email: "a@b.com" });
      expect(mockVerifyOtp).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/(setup)/permissions");
    });

    it("fails loudly when the RPC is missing, never silently passing", async () => {
      process.env.EXPO_PUBLIC_E2E = "1";
      mockParams = { email: "a@b.com", type: "signup" };
      mockRpc.mockResolvedValue({ error: { message: "function e2e_confirm does not exist" } });
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const { getByTestId, findByText } = await renderIn(<Otp />);
      await type(getByTestId, "otp-input", "000000");
      await findByText("Verification is unavailable. Please try again later.");
      expect(errSpy).toHaveBeenCalledWith("[otp] e2e_confirm missing", "function e2e_confirm does not exist");
      expect(mockReplace).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it("with the flag off, 000000 goes through the normal verifyOtp path", async () => {
      process.env.EXPO_PUBLIC_E2E = "0";
      mockParams = { email: "a@b.com", type: "signup" };
      mockVerifyOtp.mockResolvedValue({ error: null });
      const { getByTestId } = await renderIn(<Otp />);
      await type(getByTestId, "otp-input", "000000");
      expect(mockVerifyOtp).toHaveBeenCalledWith({ email: "a@b.com", token: "000000", type: "signup" });
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });
});

describe("secondary link hit targets (F1)", () => {
  it("AuthToggle segments are at least 48dp tall", async () => {
    const { getByTestId } = await renderIn(<Login />);
    expect(getByTestId("auth-toggle-login").props.style.minHeight).toBe(48);
    expect(getByTestId("auth-toggle-signup").props.style.minHeight).toBe(48);
  });

  it("login forgot-password link has a testID + hitSlop and routes to reset", async () => {
    const { getByTestId } = await renderIn(<Login />);
    expect(getByTestId("login-forgot").props.hitSlop).toBe(12);
    await press(getByTestId, "login-forgot");
    expect(mockPush).toHaveBeenCalledWith("/(auth)/reset");
  });

  it("login to-signup switch link has a testID + hitSlop and swaps route", async () => {
    const { getByTestId } = await renderIn(<Login />);
    expect(getByTestId("login-to-signup").props.hitSlop).toBe(12);
    await press(getByTestId, "login-to-signup");
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/signup");
  });

  it("signup to-login switch link has a testID + hitSlop and swaps route", async () => {
    const { getByTestId } = await renderIn(<Signup />);
    expect(getByTestId("signup-to-login").props.hitSlop).toBe(12);
    await press(getByTestId, "signup-to-login");
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("otp change-email link has a testID + hitSlop and goes back", async () => {
    mockParams = { email: "a@b.com", type: "signup" };
    const { getByTestId } = await renderIn(<Otp />);
    expect(getByTestId("otp-change-email").props.hitSlop).toBe(12);
    await press(getByTestId, "otp-change-email");
    expect(mockBack).toHaveBeenCalled();
  });
});

describe("reset", () => {
  it("email stage sends a reset code then routes to the recovery OTP", async () => {
    mockParams = {};
    mockResetPw.mockResolvedValue({ error: null });
    const { getByTestId } = await renderIn(<Reset />);
    await type(getByTestId, "reset-email", "a@b.com");
    await press(getByTestId, "reset-send");
    expect(mockResetPw).toHaveBeenCalledWith("a@b.com");
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/(auth)/otp", params: { email: "a@b.com", type: "recovery" } });
  });

  // D4 (s09): route to root so decideRoute picks the next step (same as login),
  // not straight to /(user)/home which skips setup for an incomplete profile.
  it("new stage updates the password and routes to root so decideRoute runs", async () => {
    mockParams = { stage: "new" };
    mockUpdateUser.mockResolvedValue({ error: null });
    const { getByTestId } = await renderIn(<Reset />);
    await type(getByTestId, "reset-password", "abcdefg1");
    await press(getByTestId, "reset-save");
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "abcdefg1" });
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});
