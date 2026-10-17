import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown, Check, Clapperboard, Film, Info, LoaderCircle, MessageSquare, Play, ShieldCheck, TriangleAlert, Upload, X,
} from 'lucide-react';
import StoryForm from './components/StoryForm.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Storyboard from './components/Storyboard.jsx';
import { AnnounceContext } from './components/CopyButton.jsx';
import {
  DEFAULT_SETTINGS,
  StoryValidationError,
  adjustSceneDuration,
  generateStoryboard,
  normalizeWhitespace,
  rebalanceDurations,
  sumDurations,
  validateStoryInput,
} from './lib/storyEngine.js';
import { clearState, loadState, saveState } from './lib/storage.js';
import {
  MAX_FIELD_LENGTH,
  MAX_IMPORT_BYTES,
  SCENE_TEXT_FIELDS,
  buildProject,
  downloadText,
  parseProject,
  projectFileName,
  serializeProject,
} from './lib/projectJson.js';
import { DEMO_PRESETS } from './lib/demoPresets.js';
import { carryMediaByPosition, defaultVideoSettings, referencedMediaIds } from './lib/video/videoModel.js';
import { clearAllMedia, pruneMedia } from './lib/video/mediaStore.js';
import { forgetAllMedia } from './lib/video/mediaFiles.js';
import { forgetAiData } from './lib/video/aiImages.js';
import { DEMO_SETTINGS, attachDemoImages, buildDemoBoard } from './lib/demoProject.js';
import { SITE } from './config.js';

const VideoStudio = lazy(() => import('./components/video/VideoStudio.jsx'));

const FIELD_FOCUS_IDS = {
  title: 'title-input',
  story: 'story-input',
  characterDescription: 'character-input',
  genre: 'genre-select',
  language: 'language-select',
  style: 'style-cinematic',
  sceneCount: 'sceneCount-4',
  duration: 'duration-30',
  aspectRatio: 'aspectRatio-916',
};
const EDITABLE_FIELDS = new Set(SCENE_TEXT_FIELDS);
const TOAST_ICONS = { success: Check, error: TriangleAlert, warning: TriangleAlert, info: Info };

function settingsDiffer(form, settings) {
  if (!settings) return false;
  const text = (v) => normalizeWhitespace(v);
  return (
    text(form.title) !== text(settings.title) ||
    text(form.story) !== text(settings.story) ||
    text(form.characterDescription) !== text(settings.characterDescription) ||
    ['genre', 'style', 'language', 'aspectRatio'].some((k) => form[k] !== settings[k]) ||
    Number(form.sceneCount) !== Number(settings.sceneCount) ||
    Number(form.duration) !== Number(settings.duration) ||
    Boolean(form.includeAudio) !== Boolean(settings.includeAudio)
  );
}

function focusById(id) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.focus({ preventScroll: true });
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  });
}

function EmptyState({ onImport, onOpenDemo, demoLoading }) {
  return (
    <section className="empty-state" aria-labelledby="empty-heading">
      <Film size={30} aria-hidden="true" />
      <h2 id="empty-heading">Your storyboard will appear here</h2>
      <ol className="steps">
        <li>Write or paste your story — one sentence or line per moment works best.</li>
        <li>Pick style, genre, scene count, duration and aspect ratio.</li>
        <li>Click <strong>Generate Storyboard</strong>, then edit, copy and export.</li>
      </ol>
      <div className="btn-row empty-actions">
        <button type="button" className="btn btn-primary" onClick={onOpenDemo} disabled={demoLoading}>
          {demoLoading ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {demoLoading ? 'Loading demo project…' : 'Open the demo project'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onImport}>
          <Upload size={16} aria-hidden="true" />
          Import a saved JSON project
        </button>
      </div>
      <p className="small">The demo is a six-scene mystery with sample images already added, so you can try the Video maker straight away.</p>
    </section>
  );
}

export default function App() {
  const [boot] = useState(loadState);
  const [form, setForm] = useState(() => boot.state?.draft ?? { ...DEFAULT_SETTINGS });
  const [board, setBoard] = useState(() => boot.state?.board ?? null);
  const [lockTotal, setLockTotal] = useState(() => boot.state?.ui?.lockTotal ?? true);
  const [hasEdits, setHasEdits] = useState(() => boot.state?.ui?.hasEdits ?? false);
  const [view, setView] = useState(() => (boot.state?.ui?.view === 'video' && boot.state?.board ? 'video' : 'storyboard'));
  const [errors, setErrors] = useState({});
  const [generating, setGenerating] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [saveInfo, setSaveInfo] = useState({ status: 'idle' });
  const [storageIssue, setStorageIssue] = useState(boot.reason === 'unavailable' ? boot.error : null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const fileInputRef = useRef(null);
  const latestRef = useRef(null);

  const announce = useCallback((text, type = 'info') => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now() + Math.random(), text, type });
    toastTimer.current = setTimeout(() => setToast(null), type === 'error' || type === 'warning' ? 8000 : 4000);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (boot.reason === 'corrupted') announce(boot.error, 'warning');
  }, [boot, announce]);

  // Remove images/audio left behind by older sessions (never touches media the project uses).
  useEffect(() => {
    const bootTime = Date.now();
    const timer = setTimeout(() => {
      // Use the project as it is now, and only remove files from before this page load.
      pruneMedia(referencedMediaIds(latestRef.current?.board?.video), { createdBefore: bootTime }).catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Debounced autosave to localStorage.
  useEffect(() => {
    latestRef.current = { draft: form, board, ui: { lockTotal, hasEdits, view } };
    const timer = setTimeout(() => {
      const result = saveState(latestRef.current);
      if (result.ok) {
        setSaveInfo({ status: 'saved', at: result.savedAt });
        setStorageIssue(null);
      } else {
        setSaveInfo({ status: 'error' });
        setStorageIssue(result.error);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [form, board, lockTotal, hasEdits, view]);

  // Flush on tab close / app switch so the last keystrokes are kept.
  useEffect(() => {
    const flush = () => {
      if (latestRef.current) saveState(latestRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const handleFormChange = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  function handleGenerate(event) {
    event?.preventDefault();
    const found = validateStoryInput(form);
    setErrors(found);
    const keys = Object.keys(found);
    if (keys.length) {
      announce(found[keys[0]], 'error');
      focusById(FIELD_FOCUS_IDS[keys[0]] || 'story-input');
      return;
    }
    if (
      board &&
      hasEdits &&
      !window.confirm(
        'Generating a new storyboard will replace your edited scenes.\n\nExport JSON first if you want to keep them. Continue?',
      )
    ) {
      return;
    }
    setGenerating(true);
    setTimeout(() => {
      try {
        const result = generateStoryboard(form);
        let kept = 0;
        if (board?.video) {
          // Keep uploaded images/audio by scene position; free media for scenes that no longer exist.
          const video = carryMediaByPosition(board.video, board.scenes, result.scenes);
          kept = Object.values(video.scenes).filter((m) => m.imageId).length;
          const keep = referencedMediaIds(video);
          const dropped = [...referencedMediaIds(board.video)].filter((id) => !keep.has(id));
          if (dropped.length) pruneMedia(keep, { createdBefore: Date.now() }).catch(() => {});
          result.video = video;
        }
        setBoard(result);
        setHasEdits(false);
        announce(
          `Storyboard generated: ${result.scenes.length} scenes, ${sumDurations(result.scenes)} seconds.${kept ? ` Kept ${kept} scene image${kept === 1 ? '' : 's'} by position.` : ''}`,
          'success',
        );
        focusById('storyboard-heading');
      } catch (err) {
        if (err instanceof StoryValidationError) setErrors(err.errors);
        else console.error(err);
        announce(err?.message || 'Something went wrong while generating the storyboard.', 'error');
      } finally {
        setGenerating(false);
      }
    }, 40);
  }

  const handleFieldChange = useCallback((sceneId, field, value) => {
    if (!EDITABLE_FIELDS.has(field)) return;
    const safe = String(value ?? '').slice(0, MAX_FIELD_LENGTH);
    setBoard((prev) =>
      prev ? { ...prev, scenes: prev.scenes.map((s) => (s.id === sceneId ? { ...s, [field]: safe } : s)) } : prev,
    );
    setHasEdits(true);
  }, []);

  const handleVideoChange = useCallback((updater) => {
    setBoard((prev) => (prev ? { ...prev, video: updater(prev.video ?? defaultVideoSettings()) } : prev));
  }, []);

  const handleDurationChange = useCallback(
    (sceneId, value) => {
      setBoard((prev) =>
        prev ? { ...prev, scenes: adjustSceneDuration(prev.scenes, sceneId, value, { lockTotal }) } : prev,
      );
      setHasEdits(true);
    },
    [lockTotal],
  );

  function handleToggleLock() {
    const nextLock = !lockTotal;
    setLockTotal(nextLock);
    if (nextLock && board && sumDurations(board.scenes) !== board.settings.duration) {
      setBoard((prev) => ({ ...prev, scenes: rebalanceDurations(prev.scenes, prev.settings.duration) }));
      setHasEdits(true);
      announce(`Total locked and rebalanced to ${board.settings.duration} seconds.`, 'success');
    } else {
      announce(nextLock ? 'Total duration locked.' : 'Total duration unlocked — scene durations can change freely.');
    }
  }

  function handleRebalance() {
    if (!board) return;
    setBoard((prev) => ({ ...prev, scenes: rebalanceDurations(prev.scenes, prev.settings.duration) }));
    setHasEdits(true);
    announce(`Durations rebalanced to exactly ${board.settings.duration} seconds.`, 'success');
  }

  function handleExportJson() {
    if (!board) return;
    try {
      downloadText(
        projectFileName(board.settings.title, 'json'),
        serializeProject(buildProject(board)),
        'application/json',
      );
      setHasEdits(false);
      announce(
        board.video
          ? 'JSON project exported. It includes video settings and captions, but not your images or audio files — keep those files too.'
          : 'JSON project exported. Keep it as a backup — you can re-import it any time.',
        'success',
      );
    } catch (err) {
      console.error(err);
      announce('JSON export failed. Please try again.', 'error');
    }
  }

  async function handleExportPdf() {
    if (!board) return;
    setExportingPdf(true);
    try {
      const { exportStoryboardPdf } = await import('./lib/exportPdf.js');
      const { replacedCharacters, pageCount } = exportStoryboardPdf(board);
      if (replacedCharacters) {
        announce(
          'PDF exported, but some characters (non-Latin scripts or emoji) are not supported by the built-in PDF font and were replaced with “?”. Use Copy all or JSON for the full text.',
          'warning',
        );
      } else {
        announce(`PDF exported (${pageCount} page${pageCount === 1 ? '' : 's'}).`, 'success');
      }
    } catch (err) {
      console.error(err);
      announce('PDF export failed. Try again, or use JSON export / Copy all instead.', 'error');
    } finally {
      setExportingPdf(false);
    }
  }

  function openImport() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      announce('That file is too large to be a StoryMotion project (maximum 2 MB).', 'error');
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch {
      announce('Could not read that file.', 'error');
      return;
    }
    const result = parseProject(text);
    if (!result.ok) {
      announce(`Import failed: ${result.error}`, 'error');
      return;
    }
    if (board && hasEdits && !window.confirm('Importing will replace your current edited storyboard. Continue?')) return;
    const { settings, scenes, meta, video } = result.project;
    setBoard({ settings, scenes, meta, video });
    setForm({ ...settings });
    setHasEdits(false);
    setErrors({});
    announce(`Imported “${settings.title || 'Untitled storyboard'}” with ${scenes.length} scenes.`, 'success');
    focusById('storyboard-heading');
  }

  function handleReset() {
    const message = hasEdits
      ? 'Reset will permanently clear your story, settings, edited storyboard, and all images and audio added in the Video maker from this browser. You have edits that have not been exported.\n\nContinue?'
      : 'Reset will clear your story, settings, storyboard, and all images and audio added in the Video maker from this browser.\n\nContinue?';
    if (!window.confirm(message)) return;
    clearState();
    forgetAllMedia();
    forgetAiData();
    clearAllMedia().catch(() => {});
    setView('storyboard');
    setForm({ ...DEFAULT_SETTINGS });
    setBoard(null);
    setHasEdits(false);
    setErrors({});
    announce('Workspace reset. Start a new story whenever you are ready.');
    focusById('story-input');
  }

  function handleLoadDemo(presetId) {
    const preset = DEMO_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const hasOwnStory = form.story.trim() && normalizeWhitespace(form.story) !== normalizeWhitespace(preset.settings.story);
    if (hasOwnStory && !window.confirm('Replace your current story and settings with the demo?')) return;
    setForm({ ...DEFAULT_SETTINGS, ...preset.settings });
    setErrors({});
    announce(`Demo loaded: ${preset.buttonLabel}. Click Generate Storyboard to see the result.`);
    focusById('story-input');
  }

  async function handleOpenDemoProject({ fromLink = false } = {}) {
    if (demoLoading) return;
    const hasWork = Boolean(board) || Boolean(form.story.trim());
    if (
      hasWork &&
      !window.confirm(
        fromLink
          ? 'Open the demo project?\n\nIt replaces the story, storyboard, images and audio currently in this browser. Export JSON first if you want to keep them.'
          : 'Load the demo project?\n\nIt replaces the story, storyboard, images and audio currently in this browser. Export JSON first if you want to keep them.',
      )
    ) {
      if (fromLink) announce('Demo not opened. Your current project is unchanged.');
      return;
    }
    setDemoLoading(true);
    const startedAt = Date.now();
    try {
      const { importImage } = await import('./lib/video/mediaFiles.js');
      const result = await attachDemoImages(buildDemoBoard(), { importImage });
      // The old project's images/audio are no longer referenced; free that space.
      pruneMedia(referencedMediaIds(result.board.video), { createdBefore: startedAt }).catch(() => {});
      forgetAllMedia();
      setBoard(result.board);
      setForm({ ...DEFAULT_SETTINGS, ...DEMO_SETTINGS });
      setErrors({});
      setHasEdits(false);
      setView('video');
      if (result.attached === 0) {
        announce(
          'Demo storyboard loaded, but the sample images could not be added (offline, or browser storage is blocked). You can still explore the storyboard and add your own images.',
          'warning',
        );
      } else if (result.failed) {
        announce(`Demo loaded with ${result.attached} of ${result.attached + result.failed} sample images. Add the rest from your own files.`, 'warning');
      } else {
        announce('Demo project loaded: 6 scenes with sample images. Press play on the preview, then try changing camera moves or captions.', 'success');
      }
      focusById('storyboard-heading');
    } catch (err) {
      console.error(err);
      announce('The demo project could not be loaded. Check your connection and try again.', 'error');
    } finally {
      setDemoLoading(false);
    }
  }

  // /app/?demo=1 (from the landing page) opens the demo project once, then cleans the URL.
  const demoLinkHandled = useRef(false);
  useEffect(() => {
    if (demoLinkHandled.current) return;
    demoLinkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('demo')) return;
    params.delete('demo');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    handleOpenDemoProject({ fromLink: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ToastIcon = toast ? TOAST_ICONS[toast.type] || Info : null;
  const urgentToast = toast && (toast.type === 'error' || toast.type === 'warning');
  const toastNode = toast && (
    <div key={toast.id} className={`toast toast-${toast.type}`}>
      <ToastIcon size={18} aria-hidden="true" />
      <p>{toast.text}</p>
      <button type="button" className="toast-close" onClick={() => setToast(null)} aria-label="Dismiss message">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <AnnounceContext.Provider value={announce}>
      <a className="skip-link" href="#create">
        Skip to the story form
      </a>

      <header className="site-header" id="top">
        <div className="container header-inner">
          <a className="brand" href="/" aria-label="StoryMotion Studio home page">
            <span className="brand-mark" aria-hidden="true">
              <Clapperboard size={20} />
            </span>
            <span className="brand-name">StoryMotion Studio</span>
          </a>
          <span className="header-badge">Beta</span>
          <nav className="header-nav" aria-label="Site">
            <a href="/">Home</a>
            <a href="/privacy/">Privacy</a>
            <a href="/terms/">Terms</a>
          </nav>
          {SITE.feedbackFormUrl && (
            <a
              className="btn btn-ghost btn-sm header-feedback"
              href={SITE.feedbackFormUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Send feedback (opens a Google Form in a new tab)"
            >
              <MessageSquare size={16} aria-hidden="true" />
              <span className="hide-sm">Feedback</span>
              <span className="sr-only"> (opens a Google Form in a new tab)</span>
            </a>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm header-import"
            onClick={openImport}
            aria-label="Import JSON project"
            title="Import JSON project"
          >
            <Upload size={16} aria-hidden="true" />
            <span className="hide-sm">Import JSON</span>
          </button>
        </div>
      </header>

      <main className="container">
        <section className="hero hero-compact" aria-labelledby="hero-title">
          <p className="eyebrow">Studio · public beta</p>
          <h1 id="hero-title">Turn your story into cinematic scenes.</h1>
          <p className="hero-sub">
            Write a story, generate a timed storyboard, then add an image per scene, music and voice, and export a video
            in your browser.{' '}
            <strong>
              Videos are animated still images (camera moves, transitions, captions and audio), not AI-generated video.
              Characters don’t move on their own.
            </strong>
          </p>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => focusById('story-input')}>
              <ArrowDown size={18} aria-hidden="true" />
              Write a story
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-lg"
              onClick={() => handleOpenDemoProject()}
              disabled={demoLoading}
              aria-describedby="demo-hint"
            >
              {demoLoading ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              {demoLoading ? 'Loading demo…' : 'Open the demo project'}
            </button>
          </div>
          <p id="demo-hint" className="sr-only">
            Loads a six-scene sample storyboard with images, replacing the current project.
          </p>
          <ul className="hero-points" aria-label="Highlights">
            <li><Check size={15} aria-hidden="true" />No sign-in</li>
            <li><Check size={15} aria-hidden="true" />Runs in your browser</li>
            <li><Check size={15} aria-hidden="true" />₹0 — no paid APIs</li>
            <li><Check size={15} aria-hidden="true" />Animated stills, not AI video</li>
          </ul>
        </section>

        {storageIssue && (
          <div className="notice notice-warning" role="alert">
            <TriangleAlert size={18} aria-hidden="true" />
            <p>{storageIssue}</p>
          </div>
        )}

        <section id="create" className="card" tabIndex={-1} aria-labelledby="create-heading">
          <StoryForm
            form={form}
            errors={errors}
            generating={generating}
            onChange={handleFormChange}
            onSubmit={handleGenerate}
            onLoadDemo={handleLoadDemo}
          />
        </section>

        {board ? (
          <Storyboard
            board={board}
            lockTotal={lockTotal}
            settingsChanged={settingsDiffer(form, board.settings)}
            saveInfo={saveInfo}
            exportingPdf={exportingPdf}
            onFieldChange={handleFieldChange}
            onDurationChange={handleDurationChange}
            onToggleLock={handleToggleLock}
            onRebalance={handleRebalance}
            onExportJson={handleExportJson}
            onExportPdf={handleExportPdf}
            onImportClick={openImport}
            onReset={handleReset}
            view={view}
            onViewChange={setView}
            videoPanel={
              <Suspense
                fallback={
                  <div className="panel-loading" role="status">
                    <LoaderCircle size={20} className="spin" aria-hidden="true" />
                    <span>Loading the video maker…</span>
                  </div>
                }
              >
                <ErrorBoundary label="The video maker">
                  <VideoStudio board={board} onVideoChange={handleVideoChange} />
                </ErrorBoundary>
              </Suspense>
            }
          />
        ) : (
          <EmptyState onImport={openImport} onOpenDemo={() => handleOpenDemoProject()} demoLoading={demoLoading} />
        )}
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <p>
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              <strong>Privacy:</strong> your story, images and audio are processed in this browser and videos are
              rendered on your device. There is no StoryMotion server and no account. Projects, images and audio are
              saved in this browser’s storage, so clearing browser data erases them; export JSON backups and keep your
              original files. If you turn on optional AI images, each scene’s image prompt is sent to Pollinations, a
              third-party service, when you click Generate. <a href="/privacy/">Read the privacy notice</a>.
            </span>
          </p>
          <p className="small">
            StoryMotion Studio writes storyboards and prompts with templates (it is not an AI model) and makes animated
            still-image videos in your browser. It does not generate AI video or character motion. External tools such
            as Runway, Kling or Pollinations have their own terms, limits and charges.
          </p>
          <nav className="footer-links" aria-label="Footer">
            <a href="/">Home</a>
            <a href="/privacy/">Privacy notice</a>
            <a href="/terms/">Terms of use</a>
            {SITE.feedbackFormUrl && (
              <a href={SITE.feedbackFormUrl} target="_blank" rel="noopener noreferrer">
                Send feedback<span className="sr-only"> (opens a Google Form in a new tab)</span>
              </a>
            )}
            {SITE.version && <span>v{SITE.version} beta</span>}
          </nav>
        </div>
      </footer>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleImportFile}
      />

      {/* Two always-present live regions: errors/warnings interrupt, everything else waits its turn. */}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toast && !urgentToast && toastNode}
      </div>
      <div className="toast-region" role="alert" aria-live="assertive" aria-atomic="true">
        {urgentToast && toastNode}
      </div>
    </AnnounceContext.Provider>
  );
}
