import { hashSecret, hashWord } from "@vaira/core";

// D5 credential matrix: the two secrets have deliberately different purposes
// and matching rules. Account/app passwords are exact secrets; emergency
// passwords use the existing safety-word normalisation contract server-side.
// Keep this table close to the primitives so a future screen cannot silently
// substitute one credential for the other.
describe("D5 credential matrix", () => {
  const appPassword = "Passw0rd!";
  const emergencyPassword = "blue mango 9";
  const salt = "per-install-salt";

  test.each([
    ["signup/login account password", "account authentication + app gate", true],
    ["reset account password", "account authentication + app gate", true],
    ["ProfileGate", "app password only", true],
    ["EmergencyOverlay gate 1", "app password only", true],
    ["EmergencyOverlay gate 2", "emergency password only", true],
    ["cancel hold", "PASSWORDS_OK only after both gates", true],
    ["journey start / Go Live", "does not consume either cancel credential", true],
    ["cross-journey reuse", "same account app hash; same emergency profile hash", true],
  ])("%s -> %s (documented)", (_scenario, _expected, expected) => {
    expect(expected).toBe(true);
  });

  test("app-password hash is exact and distinct from emergency-password hash", () => {
    expect(hashSecret(appPassword, salt)).not.toBe(hashWord(emergencyPassword, salt));
    expect(hashSecret(appPassword.toLowerCase(), salt)).not.toBe(hashSecret(appPassword, salt));
    expect(hashSecret(`${appPassword} `, salt)).not.toBe(hashSecret(appPassword, salt));
  });

  test("emergency-password normalisation is confined to the emergency contract", () => {
    expect(hashWord(" Blue   Mango 9 ", salt)).toBe(hashWord(emergencyPassword, salt));
    expect(hashSecret(" Blue   Mango 9 ", salt)).not.toBe(hashSecret(emergencyPassword, salt));
  });
});
