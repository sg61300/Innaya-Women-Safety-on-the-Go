// Task 26: a 1x1, effectively-invisible back camera mounted on the active
// journey screen. It only exists to feed frames to the camera service; the
// service owns the capture cadence, masking and upload.
import React from "react";
import { CameraView } from "expo-camera";
import type { ProtocolState } from "@vaira/core";
import { camera } from "../services/camera";
import { useJourney } from "../store/journey";

export function HiddenCamera() {
  return (
    <CameraView
      ref={(r) => camera.attach(r)}
      facing="back"
      testID="hidden-camera"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 1, height: 1, opacity: 0.01 }}
    />
  );
}

// D12: the camera loop runs from ARM to journey end (camera.start/stop), so its
// CameraView must be mounted for that whole window — not only on the hidden
// journey/active screen. IDLE/RESOLVED mean no armed journey; a verified pause
// (ADR-038) stops capture, so the view unmounts too.
export function shouldMountCamera(state: ProtocolState, journey: unknown, cameraPaused: boolean): boolean {
  return !!journey && state !== "IDLE" && state !== "RESOLVED" && !cameraPaused;
}

// Single mount point for the monitoring camera, rendered by (user)/_layout so it
// survives across every user screen for the life of the journey.
export function ActiveJourneyCamera() {
  const journey = useJourney((s) => s.journey);
  const state = useJourney((s) => s.ctx.state);
  const cameraPaused = useJourney((s) => s.ctx.cameraPaused);
  return shouldMountCamera(state, journey, cameraPaused) ? <HiddenCamera /> : null;
}
