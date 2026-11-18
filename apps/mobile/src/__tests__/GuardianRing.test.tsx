import { render } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { GuardianRing } from "../components/GuardianRing";
test.each([["idle", "STANDBY"], ["safe", "SAFE"], ["amber", "AMBER"], ["emergency", "EMERGENCY"], ["critical", "CRITICAL"]] as const)("state %s shows label %s", async (state, label) => {
  const { getByText, getByLabelText } = await render(<ThemeProvider initial="midnight"><GuardianRing state={state} guardians={3} emblem={{ uri: "x" }} reduceMotion /></ThemeProvider>);
  getByText(label); getByText("3 guardians"); getByLabelText(`Safety status: ${label}`);
});
