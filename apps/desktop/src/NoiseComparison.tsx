import type { NoiseSuppressionMode } from '@rooms/media';
import { useEffect, useRef, useState } from 'react';
import {
  compareNoise,
  type NoiseComparison as Comparison,
} from '../../../packages/media-providers/src/noise-comparison';

export function NoiseComparison({
  inputId,
  microphoneLive,
  mode,
}: {
  inputId: string;
  microphoneLive: boolean;
  mode: NoiseSuppressionMode;
}) {
  const [scenario, setScenario] = useState('keyboard');
  const [state, setState] = useState<'idle' | 'preparing' | 'recording'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<
    | (Comparison & {
        rawUrl: string;
        filteredUrl: string;
        scenario: string;
        mode: NoiseSuppressionMode;
      })
    | null
  >(null);
  const controller = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  const players = useRef<HTMLAudioElement[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const clear = () => {
    players.current.forEach((player) => player.pause());
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current = [];
    setResult(null);
  };
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  useEffect(() => {
    controller.current?.abort();
  }, [inputId, microphoneLive, mode]);
  const run = async (file?: File) => {
    if (controller.current) return;
    clear();
    setError('');
    setState('preparing');
    const current = new AbortController();
    controller.current = current;
    try {
      const comparison = await compareNoise({
        deviceId: inputId,
        mode,
        file,
        signal: current.signal,
        onRecording: () => {
          if (controller.current === current) setState('recording');
        },
      });
      if (controller.current !== current || current.signal.aborted) return;
      const rawUrl = URL.createObjectURL(comparison.raw),
        filteredUrl = URL.createObjectURL(comparison.filtered);
      urls.current = [rawUrl, filteredUrl];
      setResult({ ...comparison, rawUrl, filteredUrl, scenario, mode });
    } catch (failure) {
      if (controller.current === current && !current.signal.aborted)
        setError(
          failure instanceof DOMException && failure.name === 'NotAllowedError'
            ? 'Mikrofon izni verilmedi. Sistem ayarlarından ROOMS için izin ver.'
            : failure instanceof Error
              ? failure.message
              : 'Ses karşılaştırması tamamlanamadı.',
        );
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setState('idle');
      }
    }
  };
  const busy = state !== 'idle';
  const reduction =
    result?.rawDb != null && result.filteredDb != null ? result.rawDb - result.filteredDb : null;
  return (
    <section className="noise-comparison mic-test" aria-label="Filtre karşılaştırması">
      <h4>Filtre karşılaştırması</h4>
      <p>
        İlk 3 saniye yalnızca gürültü olsun; sonra gürültü sürerken konuş. Mikrofon kaydı 15 saniye
        sürer. Kayıtlar bu cihazda kalır.
      </p>
      <label className="field-label">
        Test sesi
        <select
          value={scenario}
          disabled={busy}
          onChange={(event) => {
            clear();
            setScenario(event.target.value);
          }}
        >
          <option value="keyboard">Klavye</option>
          <option value="vacuum">Süpürge</option>
          <option value="impact">Masa / kalem darbesi</option>
          <option value="dishes">Tabak / çatal sesi</option>
        </select>
      </label>
      <div className="button-row">
        <button
          className="button secondary"
          disabled={busy || microphoneLive}
          onClick={() => void run()}
        >
          15 saniye kaydet
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => picker.current?.click()}
        >
          Ses dosyası seç
        </button>
        <input
          ref={picker}
          type="file"
          accept="audio/*"
          hidden
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void run(file);
          }}
        />
        {busy && (
          <button className="button secondary" onClick={() => controller.current?.abort()}>
            İptal
          </button>
        )}
      </div>
      <p>
        Dosya: 5–30 saniye, en fazla 20 MB. Dosyanın ilk 3 saniyesinde de yalnızca gürültü
        bulunmalı.
      </p>
      {microphoneLive && <p>Yerel kayıt için görüşmedeki mikrofonunu kapat.</p>}
      {busy && (
        <p role="status">
          {state === 'preparing' ? 'Ses işleme hazırlanıyor…' : 'Kayıt alınıyor…'}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p>
            {{
              keyboard: 'Klavye',
              vacuum: 'Süpürge',
              impact: 'Masa / kalem darbesi',
              dishes: 'Tabak / çatal sesi',
            }[result.scenario] ?? 'Ses'}{' '}
            · {result.duration.toFixed(1)} saniye
          </p>
          <div className="noise-comparison-players">
            {[
              ['Ham kayıt', result.rawUrl],
              [result.mode === 'strong' ? 'Güçlü filtre' : 'Standart filtre', result.filteredUrl],
            ].map(([label, url], index) => (
              <label key={label}>
                {label}
                <audio
                  ref={(element) => {
                    if (element) players.current[index] = element;
                  }}
                  controls
                  src={url}
                  onPlay={() =>
                    players.current.forEach((player, other) => {
                      if (other !== index) player.pause();
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p>
            İlk 3 saniyedeki seviye farkı:{' '}
            <strong>{reduction === null ? 'Ölçülemedi' : `${reduction.toFixed(1)} dB`}</strong>. Bu
            değer konuşma kalitesini veya görüşme gecikmesini ölçmez.
          </p>
          <div className="button-row">
            <a
              className="button secondary"
              href={result.rawUrl}
              download={`${result.scenario}-raw.webm`}
            >
              Ham kaydı indir
            </a>
            <a
              className="button secondary"
              href={result.filteredUrl}
              download={`${result.scenario}-${result.mode}.webm`}
            >
              Filtreli kaydı indir
            </a>
            <button className="button secondary" onClick={clear}>
              Kaydı sil
            </button>
          </div>
        </>
      )}
    </section>
  );
}
