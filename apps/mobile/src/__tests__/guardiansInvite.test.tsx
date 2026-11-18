import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { Share } from "react-native";
import { ThemeProvider } from "../theme";
import { TourProvider } from "../components/tour/TourProvider";
import { GuardiansTab } from "../components/GuardiansTab";

// Task 34 F2 (dead link): the invite share must not embed `vaira://invite?...`.
// The `vaira` scheme is registered but no route handles `invite`, so a guardian
// who taps the link lands on an unmatched route. Share plain text only.

jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));

jest.mock("../lib/supabase", () => {
  const contacts = [{ id: "c1", name: "Amma Devi", phone: "9876500000", tier: "primary", linked_user_id: null }];
  const chain: any = {};
  for (const m of ["select", "eq", "order", "update"]) chain[m] = () => chain;
  chain.then = (res: any) => Promise.resolve({ data: contacts, error: null }).then(res);
  return { supabase: { from: () => chain } };
});

jest.setTimeout(120_000);

test("invite shares plain text and never the dead vaira:// deep link", async () => {
  const spy = jest.spyOn(Share, "share").mockResolvedValue({} as never);
  const { getByTestId, findByTestId } = await render(
    <ThemeProvider initial="midnight">
      <TourProvider>
        <GuardiansTab userId="u1" />
      </TourProvider>
    </ThemeProvider>
  );
  await findByTestId("guardian-row-c1");
  await act(async () => {
    fireEvent.press(getByTestId("guardian-invite-c1"));
  });
  expect(spy).toHaveBeenCalledTimes(1);
  const msg = (spy.mock.calls[0][0] as { message: string }).message;
  expect(msg).not.toContain("vaira://");
});
