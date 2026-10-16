import { Clapperboard, FlaskConical, LoaderCircle } from 'lucide-react';
import {
  ASPECTS, ASPECT_RATIOS, DURATIONS, GENRES, LANGUAGES, LIMITS, SCENE_COUNTS, STYLES,
} from '../lib/storyEngine.js';
import { DEMO_PRESETS } from '../lib/demoPresets.js';

const STYLE_HINTS = {
  cinematic: 'Photoreal film look',
  anime: 'Cel-shaded key art',
  '3d': 'Animated feature render',
  storybook: 'Painterly illustration',
};

const STORY_PLACEHOLDER = `Write one sentence or line per moment. For example:
Rain hammers the window as a sealed envelope slides under Elena's door.
Inside, a letter says: "Come to Ravenscourt before midnight."
She reaches the iron gates of an abandoned mansion…`;

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} className="field-error">
      {message}
    </p>
  );
}

function describedBy(...ids) {
  const list = ids.filter(Boolean).join(' ');
  return list || undefined;
}

function Segmented({ name, legend, hint, options, value, onChange, error }) {
  const hintId = hint ? `${name}-hint` : null;
  const errorId = error ? `${name}-error` : null;
  return (
    <fieldset className="field" aria-describedby={describedBy(hintId, errorId)}>
      <legend className="label">{legend}</legend>
      <div className="segmented">
        {options.map((opt) => {
          const id = `${name}-${String(opt.value).replace(/[^a-z0-9]/gi, '')}`;
          const checked = String(value) === String(opt.value);
          return (
            <label key={opt.value} htmlFor={id} className={`segment${checked ? ' is-active' : ''}`}>
              <input
                id={id}
                type="radio"
                name={name}
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}

export default function StoryForm({ form, errors, generating, onChange, onSubmit, onLoadDemo }) {
  const storyLength = form.story.length;
  const nearLimit = storyLength > LIMITS.storyMax * 0.9;

  return (
    <form className="story-form" onSubmit={onSubmit} noValidate>
      <div className="section-head">
        <div>
          <h2 id="create-heading">Create a storyboard</h2>
          <p className="muted">
            Each sentence or line of your story becomes a story beat. More detail gives more specific scenes.
          </p>
        </div>
        <div className="demo-actions" role="group" aria-label="Load a demo story">
          {DEMO_PRESETS.map((preset) => (
            <button key={preset.id} type="button" className="btn btn-ghost btn-sm" onClick={() => onLoadDemo(preset.id)}>
              <FlaskConical size={15} aria-hidden="true" />
              {preset.buttonLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="form-grid">
        {/* ---------- Left column: words ---------- */}
        <div className="form-col">
          <div className="field">
            <div className="label-row">
              <label className="label" htmlFor="title-input">
                Title <span className="optional">(optional)</span>
              </label>
            </div>
            <input
              id="title-input"
              type="text"
              value={form.title}
              maxLength={LIMITS.title}
              placeholder="e.g. The Letter That Remembered"
              onChange={(e) => onChange('title', e.target.value)}
              aria-invalid={errors.title ? 'true' : undefined}
              aria-describedby={describedBy(errors.title && 'title-error')}
            />
            <FieldError id="title-error" message={errors.title} />
          </div>

          <div className="field">
            <div className="label-row">
              <label className="label" htmlFor="story-input">
                Your story
              </label>
              <span className={`counter${nearLimit ? ' is-near' : ''}`} id="story-counter">
                {storyLength.toLocaleString('en-US')} / {LIMITS.storyMax.toLocaleString('en-US')}
              </span>
            </div>
            <textarea
              id="story-input"
              className="story-textarea"
              value={form.story}
              maxLength={LIMITS.storyMax}
              placeholder={STORY_PLACEHOLDER}
              onChange={(e) => onChange('story', e.target.value)}
              aria-invalid={errors.story ? 'true' : undefined}
              aria-describedby={describedBy('story-hint', 'story-counter', errors.story && 'story-error')}
              required
            />
            <p id="story-hint" className="field-hint">
              Text inside "double quotes" is kept as dialogue. Your story never leaves your browser.
            </p>
            <FieldError id="story-error" message={errors.story} />
          </div>

          <div className="field">
            <label className="label" htmlFor="character-input">
              Character consistency <span className="optional">(optional)</span>
            </label>
            <textarea
              id="character-input"
              rows={4}
              value={form.characterDescription}
              maxLength={LIMITS.character}
              placeholder="e.g. Elena, 25, long dark-brown wavy hair, hazel eyes, charcoal trench coat; Adrian, 35, swept-back dark hair, gray eyes…"
              onChange={(e) => onChange('characterDescription', e.target.value)}
              aria-invalid={errors.characterDescription ? 'true' : undefined}
              aria-describedby={describedBy('character-hint', errors.characterDescription && 'character-error')}
            />
            <p id="character-hint" className="field-hint">
              Added to every image prompt so faces and outfits stay consistent across scenes.
            </p>
            <FieldError id="character-error" message={errors.characterDescription} />
          </div>
        </div>

        {/* ---------- Right column: settings ---------- */}
        <div className="form-col">
          <fieldset className="field" aria-describedby={describedBy(errors.style && 'style-error')}>
            <legend className="label">Visual style</legend>
            <div className="style-grid">
              {Object.entries(STYLES).map(([key, style]) => {
                const checked = form.style === key;
                return (
                  <label key={key} htmlFor={`style-${key}`} className={`style-card${checked ? ' is-active' : ''}`}>
                    <input
                      id={`style-${key}`}
                      type="radio"
                      name="style"
                      value={key}
                      checked={checked}
                      onChange={() => onChange('style', key)}
                    />
                    <span className={`style-swatch swatch-${key}`} aria-hidden="true" />
                    <span className="style-text">
                      <span className="style-name">{style.label}</span>
                      <span className="style-hint">{STYLE_HINTS[key]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <FieldError id="style-error" message={errors.style} />
          </fieldset>

          <div className="two-up">
            <div className="field">
              <label className="label" htmlFor="genre-select">
                Genre / mood
              </label>
              <select
                id="genre-select"
                value={form.genre}
                onChange={(e) => onChange('genre', e.target.value)}
                aria-invalid={errors.genre ? 'true' : undefined}
              >
                {Object.entries(GENRES).map(([key, genre]) => (
                  <option key={key} value={key}>
                    {genre.label}
                  </option>
                ))}
              </select>
              <FieldError id="genre-error" message={errors.genre} />
            </div>
            <div className="field">
              <label className="label" htmlFor="language-select">
                Language
              </label>
              <select
                id="language-select"
                value={form.language}
                onChange={(e) => onChange('language', e.target.value)}
                aria-invalid={errors.language ? 'true' : undefined}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
              <FieldError id="language-error" message={errors.language} />
            </div>
          </div>

          <Segmented
            name="sceneCount"
            legend="Number of scenes"
            hint="If your story has fewer beats than scenes, clearly labeled generic beats fill the gaps."
            options={SCENE_COUNTS.map((n) => ({ value: n, label: String(n) }))}
            value={form.sceneCount}
            onChange={(v) => onChange('sceneCount', Number(v))}
            error={errors.sceneCount}
          />

          <Segmented
            name="duration"
            legend="Total duration"
            options={DURATIONS.map((d) => ({ value: d, label: `${d}s` }))}
            value={form.duration}
            onChange={(v) => onChange('duration', Number(v))}
            error={errors.duration}
          />

          <Segmented
            name="aspectRatio"
            legend="Aspect ratio"
            options={ASPECT_RATIOS.map((r) => ({ value: r, label: ASPECTS[r].label }))}
            value={form.aspectRatio}
            onChange={(v) => onChange('aspectRatio', v)}
            error={errors.aspectRatio}
          />

          <div className="field">
            <label className="checkbox" htmlFor="audio-toggle">
              <input
                id="audio-toggle"
                type="checkbox"
                checked={form.includeAudio}
                onChange={(e) => onChange('includeAudio', e.target.checked)}
              />
              <span>
                <strong>Include dialogue, voiceover &amp; SFX guidance</strong>
                <span className="field-hint">
                  Quoted lines become dialogue; everything else is an editable suggestion. No dialogue is invented.
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="form-footer">
        <p className="muted small">Template-based generation, entirely in your browser. No AI model, no upload.</p>
        <button type="submit" className="btn btn-primary btn-lg" disabled={generating} aria-busy={generating}>
          {generating ? (
            <LoaderCircle size={18} className="spin" aria-hidden="true" />
          ) : (
            <Clapperboard size={18} aria-hidden="true" />
          )}
          {generating ? 'Generating…' : 'Generate Storyboard'}
        </button>
      </div>
    </form>
  );
}
