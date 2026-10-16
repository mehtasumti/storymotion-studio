import { useState } from 'react';
import { ExternalLink, Eye, EyeOff, KeyRound, LoaderCircle, ShieldAlert, Sparkles, Square } from 'lucide-react';
import { AI_PROVIDER } from '../../lib/video/aiImages.js';

export default function AiImagePanel({ ai, missingCount, sceneCount, batch, onEnable, onDisable, onKeyChange, onRememberChange, onModelChange, onGenerateMissing, onGenerateAll, onCancelBatch }) {
  const [showKey, setShowKey] = useState(false);
  const [agree, setAgree] = useState(false);

  if (!ai.enabled) {
    return (
      <div className="panel-stack">
        <section className="sub-card" aria-labelledby="ai-off-heading">
          <h4 id="ai-off-heading">
            <Sparkles size={16} aria-hidden="true" /> Optional: generate scene images with AI
          </h4>
          <p className="small">
            StoryMotion can ask <strong>{AI_PROVIDER.name}</strong>, an outside image service, to draw each scene from
            its image prompt. It is off by default. Uploading your own images always works without it.
          </p>
          <div className="notice notice-warning" role="note">
            <ShieldAlert size={18} aria-hidden="true" />
            <div>
              <p>
                <strong>Before you turn this on:</strong>
              </p>
              <ul className="tight-list">
                <li>Each scene’s image prompt (including your character descriptions) is sent to {AI_PROVIDER.name}’s servers. Your story, audio and other images are not sent.</li>
                <li>{AI_PROVIDER.name} needs a key from a free account you create yourself. Free use is limited; check their site for current limits and terms.</li>
                <li>StoryMotion never charges you and has no server. Your key stays on this device.</li>
              </ul>
            </div>
          </div>
          <label className="mini-check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I understand that image prompts are sent to {AI_PROVIDER.name}.
          </label>
          <button type="button" className="btn btn-primary btn-sm" disabled={!agree} onClick={onEnable}>
            <Sparkles size={15} aria-hidden="true" /> Turn on AI images
          </button>
        </section>
      </div>
    );
  }

  const running = batch?.running;
  return (
    <div className="panel-stack">
      <section className="sub-card" aria-labelledby="ai-key-heading">
        <h4 id="ai-key-heading">
          <KeyRound size={16} aria-hidden="true" /> Your {AI_PROVIDER.name} key
        </h4>
        <ol className="tight-list numbered small">
          <li>
            Open{' '}
            <a href={AI_PROVIDER.keyUrl} target="_blank" rel="noopener noreferrer">
              enter.pollinations.ai <ExternalLink size={12} aria-hidden="true" />
            </a>{' '}
            and sign in (free).
          </li>
          <li>Create an API key and copy it.</li>
          <li>Paste it below.</li>
        </ol>
        <div className="key-row">
          <label className="sr-only" htmlFor="ai-key">
            Pollinations key
          </label>
          <input
            id="ai-key"
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste your key (sk_… or pk_…)"
            value={ai.key}
            onChange={(e) => onKeyChange(e.target.value.trim())}
          />
          <button type="button" className="icon-btn" onClick={() => setShowKey((s) => !s)} aria-label={showKey ? 'Hide key' : 'Show key'}>
            {showKey ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          </button>
        </div>
        <label className="mini-check">
          <input type="checkbox" checked={ai.remember} onChange={(e) => onRememberChange(e.target.checked)} />
          Remember the key on this device (otherwise it is forgotten when you close the tab)
        </label>
        <details className="small">
          <summary>Advanced: model</summary>
          <label className="mini-label" htmlFor="ai-model">
            Model name (leave empty for the service default)
          </label>
          <input id="ai-model" type="text" value={ai.model} placeholder="e.g. flux" onChange={(e) => onModelChange(e.target.value.trim())} />
          <p className="field-hint">Some models cost more of your free credit. The default is usually the cheapest.</p>
        </details>
      </section>

      <section className="sub-card" aria-labelledby="ai-gen-heading">
        <h4 id="ai-gen-heading">
          <Sparkles size={16} aria-hidden="true" /> Generate
        </h4>
        <p className="small muted">
          {missingCount} of {sceneCount} scenes have no image. Each image takes roughly 5–60 seconds. You can also
          generate one scene at a time from Scenes &amp; images.
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn-primary btn-sm" disabled={running || !ai.key || !missingCount} onClick={onGenerateMissing}>
            {running ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
            Generate {missingCount ? `${missingCount} missing` : 'missing'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={running || !ai.key} onClick={onGenerateAll}>
            Regenerate all {sceneCount}
          </button>
          {running ? (
            <button type="button" className="btn btn-danger btn-sm" onClick={onCancelBatch}>
              <Square size={13} aria-hidden="true" /> Stop
            </button>
          ) : null}
        </div>
        {batch && (batch.running || batch.done) ? (
          <div className="progress-block" aria-live="polite">
            <progress max={batch.total || 1} value={batch.done} />
            <p className="small">
              {batch.running ? `Generating ${Math.min(batch.done + 1, batch.total)} of ${batch.total}…` : `Finished: ${batch.ok} created`}
              {batch.failed ? `, ${batch.failed} failed (see the scene rows to retry or upload)` : ''}
              {batch.stoppedReason ? `. Stopped: ${batch.stoppedReason}` : ''}
            </p>
          </div>
        ) : null}
        {!ai.key ? <p className="field-hint">Add your key above to enable generation.</p> : null}
      </section>

      <button type="button" className="btn btn-ghost btn-sm" onClick={onDisable}>
        Turn off AI images and forget my key
      </button>
    </div>
  );
}
