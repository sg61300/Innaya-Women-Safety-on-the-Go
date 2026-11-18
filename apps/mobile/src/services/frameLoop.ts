// ADR-038 verified camera pause: the runner pauses/resumes the frame loop without
// tearing the camera down, so a resume is instant and the loop epoch is untouched.
import { camera } from "./camera";

export const frameLoop = {
  pause: () => camera.setPaused?.(true),
  resume: () => camera.setPaused?.(false),
};
