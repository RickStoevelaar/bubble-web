import { AudioSys, type AudioApi, type AudioDeps } from "./audio";

export { AudioSys, type AudioApi, type AudioDeps } from "./audio";
export { musicFor } from "./select";
export { installUnlock } from "./unlock";
export { createMuteButton, installMuteKey, muteButtonPlacement, applyPlacement } from "./ui";
export { newMapperState, sfxForEvent, type EventContext, type MapperState, type SfxName } from "./sfx";
export type { TrackName } from "./music";

/** Used when WebAudio is unavailable: the whole game runs silently without special cases. */
export const NULL_AUDIO: AudioApi = {
  unlock: () => undefined,
  isRunning: () => false,
  onUnlocked: () => undefined,
  playSfx: () => undefined,
  setMusic: () => undefined,
  setMuted: () => undefined,
  isMuted: () => true,
  setVolume: () => undefined,
  getVolume: () => 0,
  suspend: () => undefined,
  resume: () => undefined,
  dispose: () => undefined,
};

/** The one audio system for the page; never null. */
export function createAudio(deps?: AudioDeps): AudioApi {
  return AudioSys.create(deps) ?? NULL_AUDIO;
}
