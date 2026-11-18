export type ProtocolState = "IDLE"|"ARMED"|"SAFE"|"AMBER"|"EMERGENCY"|"CRITICAL"|"CANCEL_HOLD"|"RESOLVED_MONITORING"|"LATE_CHECK"|"RESOLVED";
// ADR-043: the wearer chooses how a self-raised alarm sounds. "silent" never
// starts the siren and never shows a red screen on the wearer's own phone.
export type AlarmMode = "siren" | "silent";
// ADR-043: the route the wearer took to a guardian-approved cancel, carried on
// CANCEL_REQUESTED and stored on the cancel_requests row.
export type CancelMethod = "word" | "photo" | "video";
export type DangerScore = 0|1|2|3;
export const REASONS = ["physical_aggression","unwanted_contact","weapon","threatening_speech","vulgar_speech",
  "user_distress_voice","user_distress_face","being_followed","isolated_location","vehicle_deviation",
  "vitals_stress","safety_word","no_signal","model_unavailable","none"] as const;
export type Reason = typeof REASONS[number];
export type Sensor = "mic"|"cam"|"gps"|"ble";
export type ChallengeKind = "check"|"pause"|"stationary"|"route"|"away";

export type ProtocolEvent =
  | { type: "ARM" }
  | { type: "MONITOR_START" }
  | { type: "SCORE"; score: DangerScore; reasons: Reason[] }
  | { type: "KEYWORD"; kind: "emergency"|"help"|"sos" }      // ADR-013: → CRITICAL from any monitoring state
  | { type: "SOS"; mode?: AlarmMode }                          // ADR-013/043: → CRITICAL; mode defaults to "siren"
  | { type: "CHALLENGE_PASSED"; guardianConfirmed?: boolean; pauseSensor?: "cam" }
  | { type: "SENSOR_PAUSE_REQUEST"; sensor: "cam" }                                  // ADR-038: user holds the camera pill 1 s
  | { type: "SENSOR_RESUME"; sensor: "cam" }                                         // ADR-038: single tap resumes
  | { type: "STATIONARY"; tier: 1|2 }                                                // ADR-039: still 15 min (1) / 30 min (2)
  | { type: "MONITOR_CAP" }                                                          // ADR-039: cap reached
  | { type: "ROUTE_DEVIATION"; kind: "detour"|"away" }                               // ADR-040
  | { type: "CHALLENGE_TIMEOUT" }
  | { type: "RECONFIRM_MISSED" }
  | { type: "SIGNALS_SAFE" }
  | { type: "SENSOR_LOST"; sensor: Sensor; batteryLow: boolean }
  | { type: "HEARTBEAT_GAP" }
  | { type: "DANGER_ZONE_ENTER" }
  | { type: "GUARDIAN_CONCERN" }
  | { type: "PLAN_CHANGE" }
  | { type: "ARRIVED" }                                        // 150 m geofence within expected duration → arrival prompt
  | { type: "ARRIVAL_PROMPT_TIMEOUT" }                         // 5 min without confirmation → challenge
  | { type: "LATE" }                                           // expected duration passed, not arrived → guardian call, keep monitoring
  | { type: "GUARDIAN_LATE_CONFIRM"; safe: boolean }           // guardian result of the late-check call
  | { type: "CALL_FAILED" }                                    // no guardian reachable (late check or cancel flow)
  | { type: "CANCEL_STEP1_OK" }                                // ADR-043 step 1: app password verified (wearer-local; no state change)
  | { type: "CANCEL_STEP2_OK" }                                // ADR-043 step 2: journey safe word verified (wearer-local; no state change)
  | { type: "CANCEL_REQUESTED"; method: CancelMethod }         // ADR-043 step 3/4: guardian cancel request opened
  | { type: "GUARDIAN_VOTE"; safe: boolean; contactId: string } // ADR-043: one guardian's verdict on the open cancel request
  | { type: "CANCEL_TIMEOUT" }                                 // ADR-043: 30 s with no guardian answer
  | { type: "GUARDIAN_SAYS_WRONG" }                            // ADR-043 / heightened mode: guardians keep the alarm on / raise it
  | { type: "END" };

export type Action =
  | "SHARE_LOCATION" | "START_CHALLENGE" | "START_END_CHALLENGE" | "NOTIFY_GUARDIANS_AMBER"
  | "NOTIFY_ALL_EMERGENCY" | "NOTIFY_ALL_CRITICAL" | "NOTIFY_NEARBY" | "SIREN_ON" | "SIREN_OFF" | "SIREN_HOLD"
  | "START_LIVE" | "FRAME_FAST" | "FRAME_NORMAL" | "START_RECONFIRM_TIMER" | "ASK_FEEDBACK"
  | "ARRIVAL_PROMPT" | "CALL_GUARDIAN"
  | "NOTIFY_GUARDIANS_CANCEL_REQUEST" | "NOTIFY_GUARDIANS_CANCELLED_BY" | "HEIGHTENED_MODE"
  | "CAMERA_PAUSE" | "CAMERA_RESUME" | "NOTIFY_GUARDIANS_CAMERA_PAUSED" | "NOTIFY_GUARDIANS_CAMERA_RESUMED"
  | "NOTIFY_GUARDIANS_STOPPED" | "NOTIFY_GUARDIANS_CAP" | "NOTIFY_GUARDIANS_ROUTE"
  | "START_CHALLENGE_PAUSE" | "START_CHALLENGE_STATIONARY" | "START_CHALLENGE_ROUTE" | "START_CHALLENGE_AWAY";

export interface ProtocolContext { state: ProtocolState; ending: boolean; heightened: boolean; cameraPaused: boolean; challenge: ChallengeKind | null; alarmMode: AlarmMode; }
export interface TransitionResult { ctx: ProtocolContext; actions: Action[]; reason: string; }
