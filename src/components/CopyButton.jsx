import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { copyText } from '../lib/clipboard.js';

/** App provides an announce(text, type) function for accessible status messages. */
export const AnnounceContext = createContext(() => {});

export default function CopyButton({ text, label = 'Copy', srLabel, compact = false, className = '' }) {
  const announce = useContext(AnnounceContext);
  const [state, setState] = useState('idle');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const isEmpty = typeof text === 'string' && text.trim() === '';

  async function handleClick() {
    const value = typeof text === 'function' ? text() : text;
    const ok = await copyText(value);
    setState(ok ? 'copied' : 'failed');
    announce(
      ok
        ? `Copied ${srLabel || label.toLowerCase()} to the clipboard.`
        : 'Copy failed — your browser blocked clipboard access. Select the text and copy it manually.',
      ok ? 'success' : 'error',
    );
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1800);
  }

  const Icon = state === 'copied' ? Check : state === 'failed' ? X : Copy;
  const visible = state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : label;
  const showText = !compact || state !== 'idle';

  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm copy-btn is-${state}${compact ? ' is-compact' : ''} ${className}`}
      onClick={handleClick}
      disabled={isEmpty}
      aria-label={srLabel ? `Copy ${srLabel}` : undefined}
      title={srLabel ? `Copy ${srLabel}` : label}
    >
      <Icon size={15} aria-hidden="true" />
      {showText && <span>{visible}</span>}
    </button>
  );
}
