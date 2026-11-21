// Legal copy for the C1 consent gate and the C7 training-data screen (Task 21).
// Version-controlled here rather than in i18n because it is legal text: the exact
// wording that was shown is recorded with each acceptance. Source of truth:
// vault Legal/01-terms-and-consent.md (Part B, §14 layered notice, and the
// 2026-09-03 founder-mandated addendum). TERMS_VERSION stays the single value
// used by routing, re-exported from src/lib/terms so there is one source.

export { TERMS_VERSION } from "../lib/terms";

// §14 "layered notice": the six plain-language bullets shown above the full
// terms, purpose, no spying, recording, sharing in emergency, retention, deletion.
export const BULLETS = [
  "INNAYA is only for protecting your own safety when you travel alone, never for watching, tracking or recording anyone else.",
  "It watches and listens only during a journey you start yourself. There is no always-on monitoring.",
  "Ambient audio is analysed, not stored. Only short clips around a danger trigger are kept as evidence.",
  "Your live location and feed are shared only with the Guardians you choose, and only when you are in an emergency.",
  "Photos and videos from your trips are kept for 30 days, then deleted. To keep them longer, or to delete them sooner, email us.",
  "You can export or delete your data, or your whole account, whenever you want, in Profile → Data.",
] as const;

// Part B, Draft Terms of Use (faithful plain-text rendering of the vault source,
// tables written as prose). Scrollable full text below the bullets.
export const FULL_TERMS = `Terms of Use

1. Purpose limitation
The Service (this mobile application, any companion wearable, and backend services, together the "Service") is provided solely to help you protect your own personal safety while travelling alone. This includes monitoring your surroundings, voice environment and, where connected, vital signs during a journey you have declared; alerting the Guardians you nominate; and helping you summon help. Any use outside this purpose is unauthorised. No future version of these Terms will ever permit covert observation, tracking, recording or surveillance of any other person.

2. Anti-misuse
You must not use the Service, or any recording, transcript, location data or derived output, to observe, follow, track, record, listen to or monitor any person other than yourself without that person's informed consent; to obtain evidence against, intimidate, harass, stalk, blackmail or defame any person; to gather information about a workplace, household, relationship or third party unrelated to your immediate personal safety; to run the Service on a device that is not your own or on behalf of another person; or to circumvent any technical guardrail in section 13. Misuse may be an offence and a civil wrong under Indian law, including the Bharatiya Nyaya Sanhita 2023, the Information Technology Act 2000 and the Digital Personal Data Protection Act 2023. You are solely liable to the Company and to any person affected for loss, damage, claims, fines and costs arising from such misuse. On reasonable suspicion of misuse the Company may suspend or terminate the account, preserve evidence, and disclose information to law-enforcement authorities where legally required or permitted.

3. Recording and bystander notice
During an active journey the Service may capture video frames, ambient audio for keyword detection, transcripts, location and vital signs. Continuous ambient audio is analysed, not stored, except for short segments around a detected trigger event, which are retained as evidence. Other people may be captured incidentally; you agree to use the Service only where such incidental capture is reasonable for personal safety, and not to point the camera at, or place the device to observe, any specific person for any other purpose. A visible recording indicator is shown during journeys and must not be disabled or concealed. Recordings may be shared, without further notice, with your Guardians, and, in the live product, with emergency services, when the Service enters an Emergency or Critical state, for the sole purpose of protecting you.

4. Consent points
Consent is obtained separately, and recorded with version and timestamp, at each of: account creation (these Terms, the Privacy Notice, and processing of account data, required); the permissions flow (microphone, location including background, camera, notifications); each journey start (capture of surroundings, sharing with named Guardians, automated escalation, bystander acknowledgment, required to start a journey); a Guardian accepting a monitoring request; the optional survey (fully skippable); connecting a vitals device (optional); and model-improvement data use (an opt-out toggle). Any consent may be withdrawn in Profile → Data. Withdrawal stops future processing; it does not make prior lawful processing unlawful.

5. Guardians
By nominating a Guardian you confirm you have that person's agreement to be contacted. No monitoring data flows until the Guardian accepts. Guardians agree to use information received only to help you, to keep recordings and locations confidential, to delete material the Service shares with them when you ask, and to respond honestly to monitoring requests. A Guardian may withdraw at any time, and you are notified.

6. Data handling (DPDP Act, 2023)
You are given a plain-language Privacy Notice at account creation, itemised by data category and purpose. Consent is free, specific, informed, unambiguous and by affirmative action, recorded with version, timestamp and device. Data is used only for safety, service operation, legal compliance and, if you turn it on, de-identified model improvement. Personal data is stored in India-region cloud storage. Retention: photos and videos from your journeys (alarm photos, journey and check selfies, cancel proof photos and videos, practice-run proofs) are kept 30 days after upload, then deleted; to keep them longer or delete them sooner, email support; your profile photo is kept until you delete your account; trigger-event clips 90 days or until any related complaint closes; the location trail 30 days; account data until deletion plus a 30-day grace period; survey data until withdrawn. You may delete your account with a 7-day cooling period, after which recordings and the location trail are hard-deleted and backups purged within 30 days. Data is encrypted in transit and at rest, access is role-based, every access to a recording is logged, and Guardian access is scoped to an active journey. Vital signs are processed only when you connect a device, and shown to active Guardians during a journey. The journey selfie is used only to compare your appearance during an ARE-YOU-SAFE check and is never shared as a face template with third parties. Law-enforcement requests are handled only under a lawful order or where disclosure is necessary to prevent imminent harm to you.

7. Minors
The Service is for persons aged 18 and above. Accounts found to belong to minors are suspended and their data deleted.

8. No guarantee of safety; not a substitute for emergency services
The Service cannot guarantee your safety, the detection of any danger, the delivery of any alert, or the response of any Guardian or authority. Network coverage, device battery, permissions, operating-system restrictions and human availability all affect the Service. It is not a substitute for contacting emergency services. In this version the Service does not automatically contact the police; it helps you or a Guardian to do so. Call 112 directly when you are able. Guardians are private individuals you choose; the Company does not vet them and is not responsible for their actions or inaction.

9. Model limitations
The Service uses automated analysis of video, audio and vital signs to estimate danger. This analysis can be wrong in both directions: it may raise an alert when there is no danger, and it may fail to detect real danger. It is deliberately tuned to prefer false alarms over missed danger, so alerts may be raised unnecessarily. You can mark alerts as genuine or false in History; with your consent, de-identified event data is used to improve the models. Escalation always includes human Guardians.

10. Indemnity
You indemnify the Company, its officers, employees and partners against all claims, losses, fines and costs arising from breach of section 2, unlawful recording of any person, provision of false Guardian consent, or any other breach of these Terms.

11. Suspension and termination
The Company may suspend or terminate accounts for breach of sections 2 or 5, for suspected minors, or for fraud. You may delete your account at any time. Sections 2, 6, 8, 9, 10 and 12 survive termination.

12. Governing law and disputes
These Terms are governed by the laws of India, and the courts of the stated seat have exclusive jurisdiction. Your rights under the Consumer Protection Act, 2019 are not excluded.

13. Technical guardrails
Monitoring happens only inside a journey you declare, with a stated origin, destination and time, there is no always-on observation. A journey-start selfie must match the account holder's photo, so the device cannot be planted on another person. Camera capture is analysed for danger to you only; there is no search, face-recognition or identification of third parties. Recordings are viewable only by you and the Guardians active in that journey, and every access is logged. The recording indicator cannot be hidden. Recordings are deleted automatically per the retention periods above. Guardian access ends when the journey ends. Every shared view carries an abuse-reporting link.`;

// C7 training-data promises, verbatim from the founder-mandated addendum
// (2026-09-03). Do not paraphrase. V12 reuses this same list.
export const TRAINING_PROMISES = [
  "Your face will never be shown. Faces and number plates are masked before any training use.",
  "On request your data is deleted, including data already used for training.",
  "We never share your data with anyone except law enforcement when required through proper legal channels.",
] as const;
