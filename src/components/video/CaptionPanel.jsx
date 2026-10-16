import { Captions } from 'lucide-react';
import {
  CAPTION_COLORS,
  CAPTION_POSITIONS,
  CAPTION_SOURCES,
  CAPTION_STYLES,
  CAPTION_SIZES,
  MOTION_STRENGTHS,
  getSceneMedia,
} from '../../lib/video/videoModel.js';

const label = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function Choice({ name, legend, options, value, onChange }) {
  return (
    <fieldset className="field">
      <legend className="mini-label">{legend}</legend>
      <div className="segmented segmented-sm">
        {options.map(([key, text]) => {
          const id = `${name}-${key.replace(/[^a-z0-9]/gi, '')}`;
          return (
            <label key={key} htmlFor={id} className={`segment${value === key ? ' is-active' : ''}`}>
              <input id={id} type="radio" name={name} value={key} checked={value === key} onChange={() => onChange(key)} />
              <span>{text}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function CaptionPanel({ board, video, onVideoChange }) {
  const cap = video.captions;
  const set = (patch) => onVideoChange((v) => ({ ...v, captions: { ...v.captions, ...patch } }));
  const edited = board.scenes.filter((s) => getSceneMedia(video, s.id).caption != null).length;

  function resetAll() {
    onVideoChange((v) => ({
      ...v,
      scenes: Object.fromEntries(Object.entries(v.scenes).map(([id, m]) => [id, { ...m, caption: null }])),
    }));
  }

  return (
    <div className="panel-stack">
      <section className="sub-card" aria-labelledby="cap-heading">
        <h4 id="cap-heading">
          <Captions size={16} aria-hidden="true" /> Captions
        </h4>
        <label className="toggle" htmlFor="captions-on">
          <input id="captions-on" type="checkbox" checked={cap.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          <span>Show captions in the video</span>
        </label>

        <div className="field">
          <label className="mini-label" htmlFor="caption-source">
            Caption text comes from
          </label>
          <select id="caption-source" value={cap.source} onChange={(e) => set({ source: e.target.value })} disabled={!cap.enabled}>
            {Object.entries(CAPTION_SOURCES).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>
          <p className="field-hint">
            Captions start from each scene’s dialogue and voiceover. Edit any caption in Scenes &amp; images.
            {edited ? ` ${edited} scene caption${edited === 1 ? ' is' : 's are'} edited by you.` : ''}
            {edited ? (
              <>
                {' '}
                <button type="button" className="link-btn" onClick={resetAll}>
                  Reset all to storyboard text
                </button>
              </>
            ) : null}
          </p>
        </div>

        <Choice name="cap-size" legend="Size" options={Object.keys(CAPTION_SIZES).map((k) => [k, label(k)])} value={cap.size} onChange={(v) => set({ size: v })} />
        <Choice name="cap-pos" legend="Position" options={CAPTION_POSITIONS.map((k) => [k, label(k)])} value={cap.position} onChange={(v) => set({ position: v })} />
        <Choice name="cap-style" legend="Style" options={Object.entries(CAPTION_STYLES)} value={cap.style} onChange={(v) => set({ style: v })} />
        <Choice name="cap-color" legend="Text colour" options={Object.entries(CAPTION_COLORS)} value={cap.color} onChange={(v) => set({ color: v })} />
        <label className="mini-check">
          <input type="checkbox" checked={cap.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} />
          UPPERCASE captions
        </label>
        <p className="field-hint">
          Long captions are split into pages of up to two lines and timed across the scene. “Bottom” keeps clear of
          app buttons on vertical videos.
        </p>
      </section>

      <section className="sub-card" aria-labelledby="motion-heading">
        <h4 id="motion-heading">Camera motion & transitions</h4>
        <Choice
          name="motion-strength"
          legend="Camera motion strength (all scenes)"
          options={Object.entries(MOTION_STRENGTHS).map(([k, m]) => [k, m.label])}
          value={video.motionStrength}
          onChange={(v) => onVideoChange((x) => ({ ...x, motionStrength: v }))}
        />
        <label className="mini-check">
          <input type="checkbox" checked={video.fadeInStart} onChange={(e) => onVideoChange((x) => ({ ...x, fadeInStart: e.target.checked }))} />
          Fade in from black at the start
        </label>
        <p className="field-hint">
          Transitions follow each scene’s “Transition to next scene” field in the storyboard: dissolve and cross-fade
          blend scenes; fade to black/white fades through a colour; cut, match cut, whip pan and others are hard cuts.
          The total length never changes.
        </p>
      </section>
    </div>
  );
}
