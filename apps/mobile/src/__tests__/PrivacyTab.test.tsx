import { render } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { PrivacyTab } from "../components/PrivacyTab";
jest.mock("../lib/supabase", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { consent_c7_training: false } }) }) }), update: () => ({ eq: async () => ({ error: null }) }) }) } }));
test("shows the three promises, providers and the masking line", async () => {
  const { findByText, getByText } = await render(<ThemeProvider initial="violetBloom"><PrivacyTab userId="u1" /></ThemeProvider>);
  await findByText("Help us protect other women?");
  getByText("Your face will never be shown. Faces and number plates are masked before any training use.");
  getByText("Every image is masked on your phone before it is used anywhere.");
  for (const p of ["Mistral", "Groq", "Gemini"]) getByText(p);
  getByText("Faces and number plates are hidden on your phone before anything is sent.");
});
