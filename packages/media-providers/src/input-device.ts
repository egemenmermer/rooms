/** The parts of a `MediaDeviceInfo` the microphone choice needs. */
export type InputDeviceEntry = Pick<MediaDeviceInfo, 'kind' | 'deviceId' | 'groupId' | 'label'>;

/** What a running capture reports about its own source (`MediaStreamTrack.getSettings()`). */
export interface CaptureSettings {
  deviceId?: string;
  groupId?: string;
}

const physical = (device: InputDeviceEntry) =>
  device.kind === 'audioinput' &&
  device.deviceId !== 'default' &&
  device.deviceId !== 'communications';

/**
 * True when the microphone the person selected is present but the capture runs on another
 * one. `selected` is a device id, or Chromium's stand-ins `default` / `communications` (the
 * Windows default communication device), which Chromium resolves only when capture opens
 * and lists with the group of the device they point at. So a default the OS moved to a
 * headset, or a chosen headset that came back after the capture fell back to the default,
 * both show up as different groups. Unknown groups never count as a change.
 */
export function captureMissesInput(
  devices: readonly InputDeviceEntry[],
  selected: string,
  capture: CaptureSettings,
) {
  const entry = devices.find((d) => d.kind === 'audioinput' && d.deviceId === selected);
  return !!entry?.groupId && !!capture.groupId && entry.groupId !== capture.groupId;
}

/** The OS name of the microphone a capture uses, or null when the list cannot tell. */
export function inputDeviceLabel(
  devices: readonly InputDeviceEntry[],
  capture: CaptureSettings,
): string | null {
  const named = devices.filter((d) => physical(d) && d.label);
  const match =
    named.find((d) => !!capture.deviceId && d.deviceId === capture.deviceId) ??
    named.find((d) => !!capture.groupId && d.groupId === capture.groupId);
  return match?.label ?? null;
}

/**
 * The OS name of the microphone a selection points at before any capture opens: a device id
 * names itself, and Chromium's `default` / `communications` stand-ins name the physical
 * device in their group. Null when the list does not say.
 */
export function selectedInputLabel(
  devices: readonly InputDeviceEntry[],
  selected: string,
): string | null {
  const entry = devices.find(
    (d) => d.kind === 'audioinput' && d.deviceId === (selected || 'default'),
  );
  if (!entry) return null;
  if (physical(entry)) return entry.label || null;
  return inputDeviceLabel(devices, { groupId: entry.groupId });
}
