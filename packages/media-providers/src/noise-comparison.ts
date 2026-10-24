import { t } from '@rooms/i18n';
import { createNoiseSuppressionNode, type NoiseSuppressionMode } from './noise-suppression';

export interface NoiseComparison {
  raw: Blob;
  filtered: Blob;
  rawDb: number | null;
  filteredDb: number | null;
  duration: number;
}

/** Record both branches concurrently from one input; never connect to speakers. */
export async function compareNoise(options: {
  deviceId?: string;
  mode?: NoiseSuppressionMode;
  file?: File;
  signal: AbortSignal;
  onRecording(): void;
}): Promise<NoiseComparison> {
  const context = new AudioContext({ sampleRate: 48_000 });
  let stream: MediaStream | undefined;
  let source: AudioNode | undefined;
  let denoiser: Awaited<ReturnType<typeof createNoiseSuppressionNode>> | undefined;
  let processingFailure: Error | undefined;
  let failRecording: (() => void) | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  const destinations: MediaStreamAudioDestinationNode[] = [];
  const recorders: MediaRecorder[] = [];
  const release = () => {
    stream?.getTracks().forEach((track) => track.stop());
    for (const recorder of recorders) if (recorder.state !== 'inactive') recorder.stop();
    if (interval) clearInterval(interval);
    source?.disconnect();
    denoiser?.disconnect();
    denoiser?.destroy();
    destinations.forEach((node) => node.stream.getTracks().forEach((track) => track.stop()));
    if (context.state !== 'closed') void context.close();
  };
  options.signal.addEventListener('abort', release, { once: true });
  const check = () => {
    if (processingFailure) throw processingFailure;
    if (options.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  };
  try {
    check();
    denoiser = await createNoiseSuppressionNode(context, options.mode ?? 'strong', {
      signal: options.signal,
      error: () => {
        processingFailure = new Error(t('Gürültü filtresi durdu. Kayıt iptal edildi.'));
        failRecording?.();
        release();
      },
    });
    check();
    let duration = 15;
    let bufferSource: AudioBufferSourceNode | undefined;
    if (options.file) {
      if (options.file.size > 20_000_000) throw new Error(t('En fazla 20 MB ses dosyası seç.'));
      const buffer = await context.decodeAudioData(await options.file.arrayBuffer());
      check();
      if (buffer.duration < 5 || buffer.duration > 30)
        throw new Error(t('5–30 saniyelik bir ses kaydı seç.'));
      duration = buffer.duration;
      bufferSource = context.createBufferSource();
      bufferSource.buffer = buffer;
      source = bufferSource;
    } else {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
          channelCount: 1,
          sampleRate: 48_000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      check();
      source = context.createMediaStreamSource(stream);
    }
    const mono = context.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = 'explicit';
    source.connect(mono);
    mono.connect(denoiser);
    const rawAnalyser = context.createAnalyser(),
      filteredAnalyser = context.createAnalyser();
    rawAnalyser.fftSize = filteredAnalyser.fftSize = 2048;
    mono.connect(rawAnalyser);
    denoiser.connect(filteredAnalyser);
    const rawDestination = context.createMediaStreamDestination(),
      filteredDestination = context.createMediaStreamDestination();
    destinations.push(rawDestination, filteredDestination);
    mono.connect(rawDestination);
    denoiser.connect(filteredDestination);
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType) throw new Error(t('Bu ortam ses kaydını desteklemiyor.'));
    const blobs = destinations.map((destination) => {
      const recorder = new MediaRecorder(destination.stream, { mimeType });
      recorders.push(recorder);
      return new Promise<Blob>((resolve, reject) => {
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onerror = () => reject(new Error(t('Ses kaydı tamamlanamadı.')));
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });
    });
    const recorded = Promise.all(blobs);
    void recorded.catch(() => {});
    await context.resume();
    check();
    recorders.forEach((recorder) => recorder.start());
    bufferSource?.start();
    const started = context.currentTime;
    const samples = new Float32Array(2048);
    let rawPower = 0,
      filteredPower = 0,
      count = 0;
    interval = setInterval(() => {
      const elapsed = context.currentTime - started;
      // Skip startup; only the instructed initial noise-only segment contributes.
      if (elapsed < 0.5 || elapsed > 3) return;
      rawAnalyser.getFloatTimeDomainData(samples);
      for (const sample of samples) rawPower += sample * sample;
      filteredAnalyser.getFloatTimeDomainData(samples);
      for (const sample of samples) filteredPower += sample * sample;
      count += samples.length;
    }, 40);
    options.onRecording();
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearInterval(clock);
        clearTimeout(watchdog);
        options.signal.removeEventListener('abort', abort);
        failRecording = undefined;
      };
      failRecording = () => {
        cleanup();
        reject(processingFailure);
      };
      const abort = () => {
        cleanup();
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      // Wall-clock timers can outpace the audio renderer during startup or device changes.
      const clock = setInterval(() => {
        if (context.currentTime - started >= duration + (bufferSource ? 0.1 : 0)) {
          cleanup();
          resolve();
        }
      }, 50);
      const watchdog = setTimeout(() => {
        cleanup();
        reject(new Error(t('Ses işleme durdu. Cihazı kontrol edip yeniden dene.')));
      }, 60_000);
      options.signal.addEventListener('abort', abort, { once: true });
    });
    check();
    recorders.forEach((recorder) => {
      if (recorder.state !== 'inactive') recorder.stop();
    });
    const [raw, filtered] = await recorded;
    check();
    const db = (power: number) => (count && power > 0 ? 10 * Math.log10(power / count) : null);
    return { raw, filtered, rawDb: db(rawPower), filteredDb: db(filteredPower), duration };
  } finally {
    options.signal.removeEventListener('abort', release);
    release();
  }
}
