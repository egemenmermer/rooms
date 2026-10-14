/** Canonical bounded PCM WAV; avoids uploading opaque codecs to the access service. */
export function encodeSoundboard(buffer: AudioBuffer): string {
  if (
    buffer.sampleRate !== 48000 ||
    buffer.duration <= 0 ||
    buffer.duration > 8 ||
    buffer.numberOfChannels < 1 ||
    buffer.numberOfChannels > 2
  )
    throw Error('En fazla 8 saniyelik mono veya stereo ses seç.');
  const channels = buffer.numberOfChannels,
    size = buffer.length * channels * 2,
    bytes = new Uint8Array(44 + size),
    view = new DataView(bytes.buffer);
  const label = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i);
  };
  label(0, 'RIFF');
  view.setUint32(4, 36 + size, true);
  label(8, 'WAVE');
  label(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, 48000, true);
  view.setUint32(28, 48000 * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  label(36, 'data');
  view.setUint32(40, size, true);
  const data = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
  for (let frame = 0; frame < buffer.length; frame++)
    for (let channel = 0; channel < channels; channel++) {
      const value = Math.max(-1, Math.min(1, data[channel][frame]));
      view.setInt16(
        44 + (frame * channels + channel) * 2,
        Math.round(value * (value < 0 ? 32768 : 32767)),
        true,
      );
    }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function soundboardBytes(base64: string): ArrayBuffer {
  const value = atob(base64);
  if (value.length > 2_000_000) throw Error('Ses dosyası çok büyük.');
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i);
  return bytes.buffer;
}
