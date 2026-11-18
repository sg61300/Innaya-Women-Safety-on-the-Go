# VAIRA end-to-end flows (Maestro)

[Maestro](https://maestro.mobile.dev) YAML flows that drive the built app on the
Pixel_7_API34 emulator. Chosen over Detox because it needs no native test build
and runs against the Expo dev client.

## Flows (run in order, one session)

| File | What it covers | Entry state |
| --- | --- | --- |
| `onboarding.yaml` | Language → sign up → OTP → permissions → profile + contact → safe words → consent → training → dashboard, then the 12-step tour to the SOS button | fresh install (`clearState: true`) |
| `journey.yaml` | Plan and start a monitored journey (destination, mode, safe word, selfie) | dashboard, tour dismissed |
| `sos.yaml` | Hold-to-confirm SOS during an active journey | journey active |

They are cumulative: `journey.yaml` assumes `onboarding.yaml` left the app on the
dashboard, and `sos.yaml` assumes a journey is active. Run the whole directory in
order:

```sh
pnpm e2e                      # = maestro test apps/mobile/e2e  (root package.json)
maestro test apps/mobile/e2e/onboarding.yaml   # or a single flow
```

## Prerequisites

1. **Emulator** running the AVD `Pixel_7_API34` (`adb devices` shows it).
2. **Dev client build** installed with the E2E flag on:
   `EXPO_PUBLIC_E2E=1` in `apps/mobile/.env`, then `npx expo run:android`
   (from `apps/mobile`). Metro on `:8081` with `adb reverse tcp:8081 tcp:8081`.
3. **`e2e_confirm` dev RPC** (lane D, migration `0009_auth_extras.sql`): the OTP
   screen accepts `000000` only when `__DEV__ && EXPO_PUBLIC_E2E === "1"`, which
   calls `e2e_confirm(email)` to mark the auth user confirmed. That function is
   gated on the Vault secret `e2e_enabled = 'on'` (Supabase forbids custom GUCs,
   ruling R26 / finding D2). Set the secret on the **dev project only**; never on
   production. Without it the OTP step cannot pass.
4. **`${TS}`** in `onboarding.yaml` keeps the sign-up email unique per run — pass
   it in: `maestro test -e TS=$(date +%s) apps/mobile/e2e/onboarding.yaml`.

## testIDs the flows depend on (owning task in parentheses)

`splash` (V5), `signup-email` `signup-phone` `signup-password` `signup-confirm`
`signup-submit` `otp-input` (T17), `perm-later` (T18), `profile-name`
`profile-age` `contact-add-manual` `contact-name-0` `contact-phone-0`
`profile-save` (T19), `survey-skip` (T19/20), `emergency-word-0`
`police-keyword` `emergency-password` `words-save` (T20), `consent-check`
`consent-agree` (T21), `training-continue` (training), `guardian-ring` (V8),
`plan-journey` `journey-to` `journey-safe-word` `selfie-capture` `journey-start`
(journey), `sos` (V7). Tour button labels `Next →` / `Done ✓` come from i18n
(`tour.ui.*`, V6/B1).

## Status

Flows and harness are delivered (Task V13 Steps 1-2). The testIDs above are set
by their owning screens as those tasks land; **Step 4 (all three flows green on
the emulator) is deferred to checkpoint C2**, after the consuming screens merge.
Save the run report to the session note with:

```sh
maestro test --format junit --output e2e-report.xml apps/mobile/e2e
```
