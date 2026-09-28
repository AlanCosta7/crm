/**
 * Gravador de voz dentro do card.
 *
 * Por que gravar aqui, e não com `<input capture>` como a foto e o vídeo: não
 * existe um `capture` de áudio confiável no iOS. Com MediaRecorder, o mesmo
 * fluxo funciona em iPhone, Android e desktop — e ainda dá para ver o tempo,
 * pausar, ouvir antes de anexar e descartar.
 *
 * Cuidados que o código carrega:
 *  - o container é negociado (`pickMimeType`): WebM/Opus no Chrome/Android,
 *    MP4/AAC no Safari, que não grava WebM
 *  - o iOS interrompe a captura quando o app vai para segundo plano, então
 *    paramos a gravação em `visibilitychange` preservando o que já foi gravado
 *    em vez de perder tudo
 *  - as trilhas do microfone são sempre encerradas (o indicador de gravação do
 *    sistema fica aceso se esquecer)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../../components/ui/Icon';
import { formatDuration } from './mediaProcess';
import {
  MAX_RECORDING_MS,
  WARN_RECORDING_MS,
  pickMimeType,
  normalizeAudioMime,
  recordingFileName,
  isRecordingSupported,
  describeRecordingError,
} from './audioRecording';

interface AudioRecorderProps {
  /** Recebe a gravação pronta para virar anexo */
  onReady: (file: File) => void;
  onClose: () => void;
}

type Phase = 'idle' | 'recording' | 'paused' | 'review';

/** Quantas barras o medidor mantém na tela. */
const METER_BARS = 32;

export function AudioRecorder({ onReady, onClose }: AudioRecorderProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [levels, setLevels] = useState<number[]>([]);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const pausedFor = useRef(0);
  const pausedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const raf = useRef<number | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  /** Encerra microfone, timers e análise de nível. */
  const teardown = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = null; }
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
  }, []);

  useEffect(() => () => {
    teardown();
    if (preview) URL.revokeObjectURL(preview.url);
  }, [teardown, preview]);

  /** Medidor de nível — barras que andam enquanto a voz entra. */
  const startMeter = (source: MediaStream) => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(source).connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        // Desvio médio em relação ao silêncio (128) → 0..1
        let sum = 0;
        for (const v of data) sum += Math.abs(v - 128);
        const level = Math.min(1, sum / data.length / 40);
        setLevels(prev => [...prev.slice(-(METER_BARS - 1)), level]);
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    } catch {
      // Medidor é enfeite: sem ele a gravação continua funcionando
    }
  };

  const finish = useCallback(
    (blob: Blob, mime: string) => {
      const type = normalizeAudioMime(mime || blob.type);
      const file = new File([blob], recordingFileName(new Date(), type), { type });
      setPreview({ file, url: URL.createObjectURL(file) });
      setPhase('review');
      teardown();
    },
    [teardown]
  );

  const stop = useCallback(() => {
    const rec = recorder.current;
    if (!rec || rec.state === 'inactive') return;
    rec.stop();
  }, []);

  const start = async () => {
    setError('');
    if (!isRecordingSupported()) {
      setError('Este navegador não permite gravar áudio. Anexe um arquivo de áudio.');
      return;
    }

    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;

      const mimeType = pickMimeType();
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = rec;
      chunks.current = [];

      rec.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = () => finish(new Blob(chunks.current, { type: rec.mimeType }), rec.mimeType);

      rec.start(1000); // fatia por segundo: perda menor se algo interromper
      startedAt.current = Date.now();
      pausedFor.current = 0;
      setElapsed(0);
      setLevels([]);
      setPhase('recording');
      startMeter(media);

      timer.current = setInterval(() => {
        const ms = Date.now() - startedAt.current - pausedFor.current;
        setElapsed(ms);
        if (ms >= MAX_RECORDING_MS) stop();
      }, 200);
    } catch (err) {
      console.error('[AudioRecorder] falha ao iniciar:', err);
      setError(describeRecordingError(err));
      teardown();
    }
  };

  const pause = () => {
    const rec = recorder.current;
    if (!rec || rec.state !== 'recording') return;
    rec.pause();
    pausedAt.current = Date.now();
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = null; }
    setPhase('paused');
  };

  const resume = () => {
    const rec = recorder.current;
    if (!rec || rec.state !== 'paused') return;
    rec.resume();
    pausedFor.current += Date.now() - pausedAt.current;
    if (stream.current) startMeter(stream.current);
    setPhase('recording');
  };

  /**
   * iOS corta a captura quando o app sai de foco. Em vez de deixar a gravação
   * morrer pela metade, encerramos e mantemos o que já foi capturado.
   */
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return;
    const onHide = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [phase, stop]);

  const discard = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setElapsed(0);
    setLevels([]);
    setPhase('idle');
  };

  const attach = () => {
    if (!preview) return;
    onReady(preview.file);
    URL.revokeObjectURL(preview.url);
    setPreview(null);
    onClose();
  };

  const nearLimit = elapsed >= WARN_RECORDING_MS;

  return (
    <div className="rec" role="group" aria-label="Gravador de áudio">
      {error && (
        <div className="note-error" role="alert">
          <Icon name="TriangleAlert" size={14} /> {error}
        </div>
      )}

      {phase === 'review' && preview ? (
        <>
          <audio className="rec-preview" src={preview.url} controls preload="metadata" />
          <div className="rec-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={discard}>
              <Icon name="RotateCcw" size={14} /> Regravar
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={attach}>
              <Icon name="Check" size={14} /> Anexar áudio
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="rec-status">
            {phase === 'idle' ? (
              <span className="muted">Toque no microfone para gravar</span>
            ) : (
              <>
                <span className={`rec-dot ${phase === 'recording' ? 'rec-dot-on' : ''}`} aria-hidden="true" />
                <span className={`rec-time ${nearLimit ? 'rec-time-warn' : ''}`}>
                  {formatDuration(elapsed)}
                </span>
                <span className="muted rec-limit">
                  {nearLimit ? 'limite de 5 min chegando' : `de ${formatDuration(MAX_RECORDING_MS)}`}
                </span>
              </>
            )}
          </div>

          {phase !== 'idle' && (
            <div className="rec-meter" aria-hidden="true">
              {Array.from({ length: METER_BARS }).map((_, i) => (
                <span
                  key={i}
                  className="rec-bar"
                  style={{ height: `${Math.max(8, (levels[i] ?? 0) * 100)}%` }}
                />
              ))}
            </div>
          )}

          <div className="rec-actions">
            {phase === 'idle' && (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={start}>
                  <Icon name="Mic" size={15} /> Gravar
                </button>
              </>
            )}

            {phase === 'recording' && (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={pause}>
                  <Icon name="Pause" size={14} /> Pausar
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={stop}>
                  <Icon name="Square" size={13} /> Concluir
                </button>
              </>
            )}

            {phase === 'paused' && (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={resume}>
                  <Icon name="Mic" size={14} /> Continuar
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={stop}>
                  <Icon name="Square" size={13} /> Concluir
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
