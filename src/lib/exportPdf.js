import { jsPDF } from 'jspdf';
import { GENRES, STYLES, sumDurations } from './storyEngine.js';
import { formatTime, pdfSafe } from './format.js';
import { projectFileName } from './projectJson.js';

const COLORS = {
  ink: [24, 24, 35],
  muted: [105, 108, 128],
  accent: [109, 63, 214],
  band: [17, 16, 38],
  rule: [214, 214, 228],
  empty: [160, 160, 172],
};

const SCENE_FIELDS = [
  ['description', 'Story beat'],
  ['imagePrompt', 'Image prompt'],
  ['animationPrompt', 'Animation prompt (image-to-video)'],
  ['camera', 'Camera'],
  ['dialogue', 'Dialogue'],
  ['voiceover', 'Voiceover'],
  ['soundEffects', 'Music & sound effects'],
  ['transition', 'Transition to next scene'],
];

export function exportStoryboardPdf(board, { save = true } = {}) {
  const { settings, scenes } = board;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentW = pageW - margin * 2;
  const bottom = pageH - margin - 6;
  let y = margin;
  let replaced = false;

  const safe = (text) => {
    const result = pdfSafe(text);
    if (result.replaced) replaced = true;
    return result.text;
  };

  const ensure = (height) => {
    if (y + height > bottom) {
      doc.addPage();
      y = margin;
    }
  };

  // Wraps text to the content width and adds pages line by line, so nothing is clipped.
  const write = (text, { size = 10, style = 'normal', color = COLORS.ink, indent = 0, after = 1.6 } = {}) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lineH = size * 0.3528 * 1.38;
    const lines = doc.splitTextToSize(safe(text), contentW - indent);
    lines.forEach((ln) => {
      ensure(lineH);
      doc.text(ln, margin + indent, y + size * 0.3528);
      y += lineH;
    });
    y += after;
  };

  const field = (label, value) => {
    ensure(12); // keep a label together with its first line
    write(label.toUpperCase(), { size: 7.5, style: 'bold', color: COLORS.accent, after: 0.6 });
    const has = value && String(value).trim();
    write(has ? value : '—', { size: 9.5, color: has ? COLORS.ink : COLORS.empty, after: 2.6 });
  };

  // ---- Title band ----
  doc.setFillColor(...COLORS.band);
  doc.rect(0, 0, pageW, 34, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(safe(settings.title || 'Untitled storyboard'), contentW);
  doc.text(titleLines.length > 1 ? `${titleLines[0]}...` : titleLines[0], margin, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(200, 195, 240);
  doc.text('StoryMotion Studio · Storyboard & prompt sheet', margin, 25);
  y = 44;

  // ---- Project metadata ----
  const total = sumDurations(scenes);
  const metaRows = [
    ['Title', settings.title || 'Untitled storyboard'],
    ['Style', STYLES[settings.style]?.label ?? settings.style],
    ['Genre / mood', GENRES[settings.genre]?.label ?? settings.genre],
    ['Aspect ratio', settings.aspectRatio],
    ['Language', settings.language],
    ['Scenes', String(scenes.length)],
    [
      'Total duration',
      `${formatTime(total)} (${total}s)${total !== settings.duration ? ` - target ${settings.duration}s` : ''}`,
    ],
    ['Exported', new Date().toLocaleString()],
  ];
  metaRows.forEach(([key, value]) => {
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(safe(value), contentW - 38);
    const height = Math.max(1, lines.length) * 4.4 + 0.8;
    ensure(height);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.muted);
    doc.text(safe(key), margin, y + 3.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.ink);
    lines.forEach((ln, i) => doc.text(ln, margin + 38, y + 3.2 + i * 4.4));
    y += height;
  });
  y += 3;

  if (settings.characterDescription) field('Character consistency', settings.characterDescription);

  write(
    'Template-generated storyboard and prompts (not written by an AI model). Review and edit prompts before using them in external tools, which may have their own usage charges. Videos made in StoryMotion Studio are animated still images, not AI-generated video.',
    { size: 8.5, style: 'italic', color: COLORS.muted, after: 4 },
  );

  // ---- Scenes ----
  scenes.forEach((scene) => {
    ensure(34);
    doc.setDrawColor(...COLORS.rule);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
    write(
      `${formatTime(scene.startTime)}-${formatTime(scene.endTime)}  ·  ${scene.duration}s  ·  ${scene.isDerived ? 'Derived beat (generic filler)' : 'From your story'}`,
      { size: 8.5, style: 'bold', color: COLORS.accent, after: 0.8 },
    );
    write(scene.title, { size: 12.5, style: 'bold', after: 2.4 });
    SCENE_FIELDS.forEach(([key, label]) => field(label, scene[key]));
    y += 2;
  });

  // ---- Appendix: source story ----
  if (settings.story) {
    ensure(24);
    doc.setDrawColor(...COLORS.rule);
    doc.line(margin, y, pageW - margin, y);
    y += 5;
    write('Source story', { size: 12.5, style: 'bold', after: 2 });
    write(settings.story, { size: 9.5, after: 2 });
  }

  // ---- Footer on every page ----
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text('Template-generated prompts · StoryMotion Studio', margin, pageH - 8);
    doc.text(`Page ${p} of ${pages}`, pageW - margin, pageH - 8, { align: 'right' });
  }

  if (save) doc.save(projectFileName(settings.title, 'pdf'));
  return { replacedCharacters: replaced, pageCount: pages };
}
