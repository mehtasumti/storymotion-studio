import { useContext, useRef, useState } from 'react';
import { LoaderCircle, Music, Trash2, Upload } from 'lucide-react';
import { AnnounceContext } from '../CopyButton.jsx';
import { AUDIO_ACCEPT, importAudio } from '../../lib/video/mediaFiles.js';
import { getSceneMedia } from '../../lib/video/videoModel.js';
import { formatTime } from '../../lib/format.js';

function VolumeSlider({ id, label, value, onChange, hint }) {
  return (
    <div className="slider-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min="0" max="1.5" step="0.05" value={value} onChange={(e) => onChange(Number(e.target.value))} aria-describedby={hint ? `${id}-hint` : undefined} />
      <output htmlFor={id}>{Math.round(value * 100)}%</output>
      {hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default function AudioPanel({ board, video, onVideoChange, discardMedia, onJumpToScenes }) {
  const announce = useContext(AnnounceContext);
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const music = video.music;
  const total = board.scenes.reduce((s, sc) => s + sc.duration, 0);
  const voiceCount = board.scenes.reduce((n, s) => {
    const m = getSceneMedia(video, s.id);
    return n + (m.narration ? 1 : 0) + (m.dialogue ? 1 : 0);
  }, 0);

  const set = (patch) => onVideoChange((v) => ({ ...v, ...patch }));
  const setVolume = (lane, value) => onVideoChange((v) => ({ ...v, volumes: { ...v.volumes, [lane]: value } }));
  const setMusic = (patch) => onVideoChange((v) => (v.music ? { ...v, music: { ...v.music, ...patch } } : v));

  async function onMusicFile(file) {
    setBusy(true);
    try {
      const clip = await importAudio(file, { kind: 'music' });
      const old = music?.id;
      set({ music: { ...clip, volume: 1, offset: 0, loop: true } });
      discardMedia(old);
      announce(`Background music added (${formatTime(clip.duration)}).`, 'success');
    } catch (err) {
      announce(err?.message || 'Could not add this audio file.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-stack">
      <section className="sub-card" aria-labelledby="music-heading">
        <h4 id="music-heading">
          <Music size={16} aria-hidden="true" /> Background music
        </h4>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
            {music ? 'Replace music' : 'Upload music'}
          </button>
          {music && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const old = music.id;
                set({ music: null });
                discardMedia(old);
              }}
            >
              <Trash2 size={14} aria-hidden="true" /> Remove
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={AUDIO_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="music-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onMusicFile(f);
            }}
          />
        </div>
        {music ? (
          <>
            <p className="clip-name">
              {music.name} · {formatTime(music.duration)}
              {music.duration < total && !music.loop ? <span className="clip-warn"> · shorter than the video; it will end early</span> : null}
            </p>
            <VolumeSlider id="music-clip-vol" label="Track volume" value={music.volume ?? 1} onChange={(v) => setMusic({ volume: v })} />
            <div className="inline-fields">
              <label className="mini-check">
                <input type="checkbox" checked={music.loop !== false} onChange={(e) => setMusic({ loop: e.target.checked })} />
                Loop to fill the whole video
              </label>
              <label className="mini-field">
                Start the track at
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  max={Math.max(0, music.duration - 1)}
                  value={music.offset ?? 0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setMusic({ offset: Math.max(0, Math.min(music.duration - 0.5, v)) });
                  }}
                />
                s
              </label>
            </div>
            <p className="field-hint">The music fades in at the start and out at the end automatically.</p>
          </>
        ) : (
          <p className="field-hint">
            Use music you have the rights to (for example, your own tracks or free libraries such as the YouTube Audio
            Library). The file stays in this browser.
          </p>
        )}
      </section>

      <section className="sub-card" aria-labelledby="voice-heading">
        <h4 id="voice-heading">Narration & dialogue</h4>
        <p className="field-hint">
          {voiceCount
            ? `${voiceCount} voice clip${voiceCount === 1 ? '' : 's'} added. `
            : 'No voice clips yet. '}
          Add recordings per scene in{' '}
          <button type="button" className="link-btn" onClick={onJumpToScenes}>
            Scenes &amp; images → Voice clips
          </button>
          . Each clip starts with its scene, so it stays in sync if you change durations.
        </p>
      </section>

      <section className="sub-card" aria-labelledby="mix-heading">
        <h4 id="mix-heading">Mix</h4>
        <VolumeSlider id="vol-music" label="Music" value={video.volumes.music} onChange={(v) => setVolume('music', v)} />
        <VolumeSlider id="vol-narration" label="Narration" value={video.volumes.narration} onChange={(v) => setVolume('narration', v)} />
        <VolumeSlider id="vol-dialogue" label="Dialogue" value={video.volumes.dialogue} onChange={(v) => setVolume('dialogue', v)} />
        <label className="mini-check">
          <input type="checkbox" checked={video.ducking !== false} onChange={(e) => set({ ducking: e.target.checked })} />
          Lower the music while narration or dialogue plays
        </label>
      </section>
    </div>
  );
}
