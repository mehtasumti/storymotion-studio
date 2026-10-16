import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Download, FileVideo, LoaderCircle, RefreshCw, Square, TriangleAlert } from 'lucide-react';
import { AnnounceContext } from '../CopyButton.jsx';
import { QUALITIES, buildAudioSchedule, getSceneMedia, outputSize } from '../../lib/video/videoModel.js';
import { ExportCancelledError, detectExportSupport, exportVideo } from '../../lib/video/exporter.js';
import { projectFileName } from '../../lib/projectJson.js';

const PHASES = {
  preparing: 'Preparing images and captions…',
  audio: 'Mixing audio…',
  video: 'Rendering frames…',
  recording: 'Recording in real time… keep this tab open and visible',
  finalizing: 'Finishing the file…',
  verifying: 'Checking the finished video…',
};

const sizeText = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

export default function ExportPanel({ board, video, onVideoChange }) {
  const announce = useContext(AnnounceContext);
  const { settings, scenes } = board;
  const format = video.export.format;
  const quality = video.export.quality;
  const withAudio = useMemo(() => buildAudioSchedule(scenes, video).items.length > 0, [scenes, video]);
  const [support, setSupport] = useState(null);
  const [checking, setChecking] = useState(true);
  const [job, setJob] = useState(null); // { phase, progress, startedAt }
  const [result, setResult] = useState(null); // { url, blob, report, ext, method, fileName }
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const resultUrl = useRef(null);

  useEffect(() => {
    let alive = true;
    setChecking(true);
    detectExportSupport(settings.aspectRatio, quality, { withAudio })
      .then((s) => alive && setSupport(s))
      .catch(() => alive && setSupport({ webm: null, mp4: null, notes: ['Could not check video support in this browser.'] }))
      .finally(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, [settings.aspectRatio, quality, withAudio]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    },
    [],
  );

  const setExport = (patch) => onVideoChange((v) => ({ ...v, export: { ...v.export, ...patch } }));

  // If the saved format is not available here but the other one is, switch to it.
  useEffect(() => {
    if (!support || checking) return;
    const other = format === 'webm' ? 'mp4' : 'webm';
    if (!support[format] && support[other]) onVideoChange((v) => ({ ...v, export: { ...v.export, format: other } }));
  }, [support, checking, format, onVideoChange]);
  const plan = support?.[format] ?? null;
  const missingImages = scenes.filter((s) => !getSceneMedia(video, s.id).imageId).length;
  const total = scenes.reduce((s, sc) => s + sc.duration, 0);
  const { width, height } = outputSize(settings.aspectRatio, quality);
  const running = !!job;

  async function start() {
    if (!plan) return;
    setError(null);
    if (resultUrl.current) {
      URL.revokeObjectURL(resultUrl.current);
      resultUrl.current = null;
    }
    setResult(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = performance.now();
    setJob({ phase: 'preparing', progress: 0, startedAt });
    try {
      const out = await exportVideo({
        board,
        video,
        format,
        quality,
        support: plan,
        signal: controller.signal,
        onProgress: (p) => setJob((j) => (j ? { ...j, ...p } : j)),
      });
      const url = URL.createObjectURL(out.blob);
      resultUrl.current = url;
      const fileName = projectFileName(settings.title, out.ext);
      const seconds = (performance.now() - startedAt) / 1000;
      setResult({ ...out, url, fileName, seconds });
      announce(
        out.report.ok
          ? `Video ready: ${out.report.summary}. Click Download video to save it.`
          : `Video created, but the check found problems: ${out.report.problems.join(' ')}`,
        out.report.ok ? 'success' : 'warning',
      );
    } catch (err) {
      if (err instanceof ExportCancelledError) {
        announce('Export cancelled.');
      } else {
        console.error(err);
        setError(err?.message || 'The export failed.');
        announce(err?.message || 'The export failed.', 'error');
      }
    } finally {
      abortRef.current = null;
      setJob(null);
    }
  }

  function download() {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url;
    a.download = result.fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const eta = (() => {
    if (!job || job.progress < 0.03 || !['video', 'recording'].includes(job.phase)) return null;
    const elapsed = (performance.now() - job.startedAt) / 1000;
    const remaining = Math.max(0, (elapsed / job.progress) * (1 - job.progress));
    return remaining > 1 ? `about ${Math.ceil(remaining)}s left` : null;
  })();

  return (
    <section className="export-card" aria-labelledby="export-heading">
      <h3 id="export-heading">
        <FileVideo size={17} aria-hidden="true" /> Export video
      </h3>

      <fieldset className="field" disabled={running}>
        <legend className="mini-label">Format</legend>
        <div className="segmented segmented-sm">
          {['webm', 'mp4'].map((f) => {
            const available = !!support?.[f];
            return (
              <label key={f} htmlFor={`fmt-${f}`} className={`segment${format === f ? ' is-active' : ''}${!checking && !available ? ' is-disabled' : ''}`}>
                <input id={`fmt-${f}`} type="radio" name="export-format" value={f} checked={format === f} disabled={!checking && !available} onChange={() => setExport({ format: f })} />
                <span>
                  {f.toUpperCase()}
                  {!checking && !available ? ' (not here)' : ''}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="field">
        <label className="mini-label" htmlFor="export-quality">
          Quality
        </label>
        <select id="export-quality" value={quality} disabled={running} onChange={(e) => setExport({ quality: e.target.value })}>
          {Object.entries(QUALITIES).map(([k, q]) => (
            <option key={k} value={k}>
              {q.label}
            </option>
          ))}
        </select>
      </div>

      <p className="small muted">
        {width}×{height} · {settings.aspectRatio} · 30 fps · {total}s{withAudio ? ' · with audio' : ' · no audio added'}
        {plan ? ` · ${plan.method === 'webcodecs' ? 'fast export' : 'real-time recording'}` : ''}
      </p>

      {checking ? (
        <p className="small">
          <LoaderCircle size={14} className="spin" aria-hidden="true" /> Checking what this browser can export…
        </p>
      ) : null}
      {!checking && support?.notes?.length ? (
        <ul className="note-list small">
          {support.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      {!checking && format === 'mp4' && !support?.mp4 && support?.webm ? (
        <p className="small clip-warn">MP4 is not available in this browser. Choose WebM, or try desktop Chrome or Edge.</p>
      ) : null}
      {!checking && plan?.method === 'recorder' ? (
        <p className="small clip-warn">This browser records the video in real time ({total}s). Keep this tab visible until it finishes.</p>
      ) : null}
      {missingImages ? (
        <p className="small clip-warn">
          {missingImages} scene{missingImages === 1 ? ' has' : 's have'} no image and will show a titled placeholder card.
        </p>
      ) : null}

      {running ? (
        <div className="progress-block" aria-live="polite">
          <progress max="1" value={job.progress || 0} aria-label="Export progress" />
          <p className="small">
            {PHASES[job.phase] || 'Working…'} {Math.round((job.progress || 0) * 100)}%{eta ? ` · ${eta}` : ''}
          </p>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => abortRef.current?.abort()}>
            <Square size={13} aria-hidden="true" /> Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-block" onClick={start} disabled={checking || !plan} data-testid="export-video">
          <FileVideo size={17} aria-hidden="true" />
          Create {format.toUpperCase()} video
        </button>
      )}

      {error ? (
        <div className="inline-error" role="alert">
          <CircleAlert size={15} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" className="btn btn-ghost btn-xs" onClick={start} disabled={!plan}>
            <RefreshCw size={13} aria-hidden="true" /> Try again
          </button>
        </div>
      ) : null}

      {result ? (
        <div className={`result-block${result.report.ok ? ' is-ok' : ' is-warn'}`} data-testid="export-result">
          <p className="result-title">
            {result.report.ok ? <CircleCheck size={17} aria-hidden="true" /> : <TriangleAlert size={17} aria-hidden="true" />}
            {result.report.ok ? 'Video ready and checked' : 'Video created with problems'}
          </p>
          <p className="small">
            {result.report.summary} · {sizeText(result.blob.size)} · made in {result.seconds.toFixed(0)}s
          </p>
          {result.report.problems.length ? (
            <ul className="note-list small">
              {result.report.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          {result.missingAudio?.length ? <p className="small clip-warn">{result.missingAudio.length} audio file(s) were missing in this browser and were left out.</p> : null}
          <button type="button" className="btn btn-primary btn-block" onClick={download} data-testid="download-video">
            <Download size={17} aria-hidden="true" /> Download video ({result.ext.toUpperCase()})
          </button>
          {result.ext === 'webm' ? (
            <p className="field-hint">
              WebM plays in Chrome, Edge, Firefox and VLC, and uploads to YouTube. Some phone galleries and Instagram
              prefer MP4.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
