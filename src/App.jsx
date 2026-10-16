import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, Check, Clapperboard, Film, Info, ShieldCheck, TriangleAlert, Upload, X } from 'lucide-react';
import StoryForm from './components/StoryForm.jsx';
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

function EmptyState({ onImport }) {
  return (
    <section className="empty-state" aria-labelledby="empty-heading">
      <Film size={30} aria-hidden="true" />
      <h2 id="empty-heading">Your storyboard will appear here</h2>
      <ol className="steps">
        <li>Write or paste your story — one sentence or line per moment works best.</li>
        <li>Pick style, genre, scene count, duration and aspect ratio.</li>
        <li>Click <strong>Generate Storyboard</strong>, then edit, copy and export.</li>
      </ol>
      <button type="button" className="btn btn-ghost" onClick={onImport}>
        <Upload size={16} aria-hidden="true" />
        Import a saved JSON project
      </button>
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

  const ToastIcon = toast ? TOAST_ICONS[toast.type] || Info : null;

  return (
    <AnnounceContext.Provider value={announce}>
      <a className="skip-link" href="#create">
        Skip to the story form
      </a>

      <header className="site-header" id="top">
        <div className="container header-inner">
          <a className="brand" href="#top">
            <span className="brand-mark" aria-hidden="true">
              <Clapperboard size={20} />
            </span>
            <span className="brand-name">StoryMotion Studio</span>
          </a>
          <span className="header-badge">Free Storyboard &amp; Video Maker</span>
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
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">Your story. Every scene. Ready to create.</p>
          <h1 id="hero-title">Turn your story into cinematic scenes.</h1>
          <p className="hero-sub">
            Paste a story and get an editable, timed storyboard with image prompts, animation prompts, camera moves,
            audio notes and transitions. Then add an image per scene, music and voice, and export a video right in your
            browser.{' '}
            <strong>
              StoryMotion videos are animated still images (camera moves, transitions, captions, audio), not AI-generated
              video: characters do not move on their own.
            </strong>
          </p>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => focusById('story-input')}>
              <ArrowDown size={18} aria-hidden="true" />
              Create Storyboard
            </button>
          </div>
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
                  <p className="muted small" role="status">
                    Loading the video maker…
                  </p>
                }
              >
                <VideoStudio board={board} onVideoChange={handleVideoChange} />
              </Suspense>
            }
          />
        ) : (
          <EmptyState onImport={openImport} />
        )}
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <p>
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              <strong>Privacy:</strong> your story, images and audio are processed entirely in this browser, and
              videos are rendered on your device. There is no backend, no account and no tracking. Projects, images and
              audio are saved in this browser’s storage — clearing browser data erases them, so export JSON backups and
              keep your original files. If you turn on optional AI images, only the scene image prompts are sent to
              Pollinations, a third-party service, when you click Generate.
            </span>
          </p>
          <p className="small">
            StoryMotion Studio writes storyboards and prompts with templates (it is not an AI model) and makes animated
            still-image videos in your browser. It does not generate AI video or character motion. External tools such
            as Runway, Kling or Pollinations have their own terms, limits and charges.
          </p>
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

      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toast && (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <ToastIcon size={18} aria-hidden="true" />
            <p>{toast.text}</p>
            <button type="button" className="toast-close" onClick={() => setToast(null)} aria-label="Dismiss message">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </AnnounceContext.Provider>
  );
}
