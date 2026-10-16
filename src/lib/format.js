import { GENRES, STYLES, sumDurations } from './storyEngine.js';

export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const line = (label, value) => `${label}: ${value && String(value).trim() ? value : '—'}`;

export function sceneToText(scene) {
  return [
    `${scene.title} (${formatTime(scene.startTime)}–${formatTime(scene.endTime)}, ${scene.duration}s)`,
    line('Story beat', scene.description),
    line('Image prompt', scene.imagePrompt),
    line('Animation prompt', scene.animationPrompt),
    line('Camera', scene.camera),
    line('Dialogue', scene.dialogue),
    line('Voiceover', scene.voiceover),
    line('Music & SFX', scene.soundEffects),
    line('Transition to next', scene.transition),
  ].join('\n');
}

export function storyboardToText(board) {
  const { settings, scenes } = board;
  const total = sumDurations(scenes);
  const header = [
    `${settings.title || 'Untitled storyboard'} — StoryMotion Studio`,
    `Style: ${STYLES[settings.style]?.label ?? settings.style} · Genre: ${GENRES[settings.genre]?.label ?? settings.genre} · Aspect ratio: ${settings.aspectRatio} · Language: ${settings.language}`,
    `Scenes: ${scenes.length} · Total: ${formatTime(total)} (${total}s)`,
    settings.characterDescription ? `Character consistency: ${settings.characterDescription}` : null,
    'Template-generated storyboard and prompts. StoryMotion Studio does not render videos.',
  ].filter(Boolean);
  return [header.join('\n'), ...scenes.map(sceneToText)].join('\n\n');
}

const PDF_REPLACEMENTS = {
  '‘': "'", '’': "'", '‚': "'", '“': '"', '”': '"', '„': '"',
  '–': '-', '—': '-', '…': '...', '•': '-', '→': '->', '\u00a0': ' ', '₹': 'Rs.', '™': '(TM)', '€': 'EUR',
};

/**
 * jsPDF's built-in fonts only cover Latin-1. This maps common typographic
 * characters to ASCII and replaces anything else with "?" (flagged as lossy).
 */
export function pdfSafe(input) {
  let replaced = false;
  let text = '';
  for (const ch of String(input ?? '')) {
    if (PDF_REPLACEMENTS[ch] !== undefined) {
      text += PDF_REPLACEMENTS[ch];
      continue;
    }
    const code = ch.codePointAt(0);
    if (ch === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) text += ch;
    else if (ch === '\t') text += ' ';
    else if (code < 0x20 || (code >= 0x7f && code < 0xa0)) continue;
    else {
      text += '?';
      replaced = true;
    }
  }
  return { text, replaced };
}
