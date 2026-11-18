// The SOS tab button is the hold-to-confirm control in FooterNav; this route
// renders nothing and is never navigated to (the centre slot fires runner.SOS
// directly). It exists so expo-router has a concrete screen for the "sos" name.
export default function SosScreen() {
  return null;
}
