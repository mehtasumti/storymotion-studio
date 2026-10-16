import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Pause, Play, SkipBack, Volume2, VolumeX } from 'lucide-react';
import { formatTime } from '../../lib/format.js';
import { buildAudioSchedule, buildVideoPlan, outputSize, segmentIndexAt } from '../../lib/video/videoModel.js';
import { drawFrame, layoutCaptions } from '../../lib/video/renderer.js';
import { PreviewAudio, loadScheduleBuffers } from '../../lib/video/audioEngine.js';
import { loadImageBitmap } from '../../lib/video/mediaFiles.js';

const PREVIEW_SCALE = 0.75; // of the 720p frame — sharp enough, light on phones

/** Loads every image the plan uses into a Map(id -> drawable). */
export function useImages(plan) {
  const ids = useMemo(() => [...new Set(plan.segments.map((s) => s.imageId).filter(Boolean))].sort().join('|'), [plan]);
  const [images, setImages] = useState(() => new Map());
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    const list = ids ? ids.split('|') : [];
    setLoading(list.length > 0);
    Promise.all(list.map(async (id) => [id, await loadImageBitmap(id)])).then((entries) => {
      if (!alive) return;
      setImages(new Map(entries.filter(([, img]) => img)));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [ids]);
  return { images, loading };
}

export default function VideoPreview({ board, video, seekRef }) {
  const { scenes, settings } = board;
  const size = useMemo(() => {
    const s = outputSize(settings.aspectRatio, '720p');
    return { width: Math.round((s.width * PREVIEW_SCALE) / 2) * 2, height: Math.round((s.height * PREVIEW_SCALE) / 2) * 2 };
  }, [settings.aspectRatio]);
  const plan = useMemo(() => buildVideoPlan(scenes, video, size), [scenes, video, size]);
  const schedule = useMemo(() => buildAudioSchedule(scenes, video), [scenes, video]);
  const { images, loading } = useImages(plan);

  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const rafRef = useRef(0);
  const clockRef = useRef({ startCtx: 0, startT: 0 });
  const tRef = useRef(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioNote, setAudioNote] = useState('');

  const captionPagesMemo = useMemo(() => {
    const canvas = canvasRef.current || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!canvas) return [];
    const ctx = canvas.getContext('2d');
    return layoutCaptions(ctx, scenes, video, size.width, size.height);
  }, [scenes, video, size]);

  const stateRef = useRef(null);
  stateRef.current = { plan, images, captionPages: captionPagesMemo, captions: video.captions };

  const paint = useCallback((time, { poster = false } = {}) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Paused at 0:00, show the first scene rather than the black fade-in frame.
    const fadeIn = stateRef.current.plan.fadeIn || 0;
    drawFrame(canvas.getContext('2d'), poster && time === 0 && fadeIn ? fadeIn : time, stateRef.current);
  }, []);

  // Redraw when anything visual changes while paused.
  useEffect(() => {
    if (!playing) paint(tRef.current, { poster: true });
  }, [plan, images, captionPagesMemo, video.captions, playing, paint]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.stop();
    setPlaying(false);
  }, []);

  const start = useCallback(
    async (from) => {
      const t0 = from >= plan.total - 0.05 ? 0 : Math.max(0, from);
      if (!audioRef.current) audioRef.current = new PreviewAudio();
      const audio = audioRef.current;
      setStarting(true);
      let at = null;
      try {
        let buffers = new Map();
        if (!muted && schedule.items.length) {
          const loaded = await loadScheduleBuffers(schedule);
          buffers = loaded.buffers;
          setAudioNote(loaded.missing.length ? `${loaded.missing.length} audio file(s) are missing in this browser and were skipped.` : '');
        }
        at = await audio.start(t0, muted ? { ...schedule, items: [] } : schedule, buffers, video.ducking !== false);
      } catch {
        setAudioNote('Audio could not start in this browser; playing pictures only.');
      } finally {
        setStarting(false);
      }
      clockRef.current = { startCtx: at ?? audio.now(), startT: t0 };
      setPlaying(true);
      const loop = () => {
        const elapsed = audio.now() - clockRef.current.startCtx;
        const time = Math.min(plan.total, clockRef.current.startT + Math.max(0, elapsed));
        tRef.current = time;
        paint(time);
        setT(time);
        if (time >= plan.total) {
          audio.stop();
          setPlaying(false);
          return;
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(loop);
    },
    [plan.total, schedule, muted, video.ducking, paint],
  );

  const seek = useCallback(
    (time, play = false) => {
      const clamped = Math.max(0, Math.min(plan.total, time));
      tRef.current = clamped;
      setT(clamped);
      if (playing || play) start(clamped);
      else paint(clamped, { poster: true });
      if (play) canvasRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    },
    [plan.total, playing, start, paint],
  );

  useEffect(() => {
    if (seekRef) seekRef.current = seek;
  }, [seek, seekRef]);

  // If audio settings change during playback, restart from the current point so edits are heard immediately.
  const scheduleKey = useMemo(() => JSON.stringify(schedule.items) + String(video.ducking) + String(muted), [schedule, video.ducking, muted]);
  const lastKey = useRef(scheduleKey);
  useEffect(() => {
    if (lastKey.current !== scheduleKey) {
      lastKey.current = scheduleKey;
      if (playing) start(tRef.current);
    }
  }, [scheduleKey, playing, start]);

  // Clamp time when the total changes (durations edited).
  useEffect(() => {
    if (tRef.current > plan.total) {
      tRef.current = plan.total;
      setT(plan.total);
    }
  }, [plan.total]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.close();
    },
    [],
  );

  const sceneIndex = segmentIndexAt(plan, t);
  const current = plan.segments[sceneIndex];

  return (
    <div className="preview-card">
      <div className={`preview-frame preview-${settings.aspectRatio === '16:9' ? 'wide' : 'tall'}`}>
        <canvas
          ref={canvasRef}
          width={size.width}
          height={size.height}
          className="preview-canvas"
          role="img"
          aria-label={`Video preview, ${formatTime(t)} of ${formatTime(plan.total)}${current ? `, scene ${current.sceneNumber}` : ''}`}
          onClick={() => (playing ? stop() : start(tRef.current))}
        />
        {loading ? (
          <span className="preview-loading">
            <LoaderCircle size={16} className="spin" aria-hidden="true" /> Loading images…
          </span>
        ) : null}
      </div>

      <div className="player-controls">
        <button
          type="button"
          className="icon-btn icon-btn-lg"
          onClick={() => (playing ? stop() : start(tRef.current))}
          aria-label={playing ? 'Pause preview' : 'Play preview'}
          disabled={starting}
          data-testid="preview-play"
        >
          {starting ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>
        <button type="button" className="icon-btn" onClick={() => seek(0)} aria-label="Back to start">
          <SkipBack size={16} aria-hidden="true" />
        </button>
        <div className="scrubber">
          <input
            type="range"
            min="0"
            max={plan.total}
            step="0.01"
            value={t}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Preview position"
            aria-valuetext={`${formatTime(t)} of ${formatTime(plan.total)}`}
          />
          <div className="scrubber-marks" aria-hidden="true">
            {plan.segments.slice(1).map((s) => (
              <span key={s.sceneId} style={{ left: `${(s.start / plan.total) * 100}%` }} />
            ))}
          </div>
        </div>
        <span className="player-time" aria-hidden="true">
          {formatTime(t)} / {formatTime(plan.total)}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? 'Unmute preview' : 'Mute preview'}
          aria-pressed={muted}
        >
          {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
        </button>
      </div>
      <p className="player-status" aria-live="polite">
        {current ? current.title : ''}
        {audioNote ? <span className="clip-warn"> · {audioNote}</span> : null}
      </p>
    </div>
  );
}
