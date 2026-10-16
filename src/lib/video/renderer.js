/**
 * Canvas renderer shared by the live preview and the exporter, so what you
 * preview is exactly what gets exported.
 */
import {
  CAPTION_SIZES,
  captionPages,
  captionTextFor,
  frameAt,
  getSceneMedia,
  motionTransform,
  sourceRect,
} from './videoModel.js';

export const CAPTION_FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", "Nirmala UI", "Hiragino Sans", "Yu Gothic", Arial, sans-serif';

const PLACEHOLDER_HUES = [262, 222, 330, 190, 28, 280, 160, 350, 205, 45];

export function captionFont(size, width, height) {
  const px = Math.round((CAPTION_SIZES[size] || CAPTION_SIZES.medium) * Math.min(width, height));
  return { px, font: `700 ${px}px ${CAPTION_FONT_STACK}`, lineHeight: Math.round(px * 1.28) };
}

/**
 * Lays out caption pages for every scene once (needs a canvas context for
 * text measurement). Returns [{ sceneId, lines, start, end }].
 */
export function layoutCaptions(ctx, scenes, video, width, height) {
  const cap = video.captions;
  if (!cap?.enabled) return [];
  const { font } = captionFont(cap.size, width, height);
  ctx.save();
  ctx.font = font;
  const maxWidth = width * (width < height ? 0.84 : 0.72);
  const measure = (s) => ctx.measureText(s).width;
  const pages = [];
  for (const scene of scenes) {
    const text = captionTextFor(scene, getSceneMedia(video, scene.id), cap);
    if (!text) continue;
    captionPages(text, scene.startTime, scene.endTime, { maxWidth, measure, maxLines: 2 }).forEach((p) =>
      pages.push({ sceneId: scene.id, ...p }),
    );
  }
  ctx.restore();
  return pages;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function drawPlaceholder(ctx, seg, W, H) {
  const hue = PLACEHOLDER_HUES[seg.index % PLACEHOLDER_HUES.length];
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, `hsl(${hue} 45% 16%)`);
  g.addColorStop(1, `hsl(${(hue + 40) % 360} 50% 7%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const base = Math.min(W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `800 ${Math.round(base * 0.2)}px ${CAPTION_FONT_STACK}`;
  ctx.fillText(String(seg.sceneNumber), W / 2, H * 0.4);
  ctx.font = `600 ${Math.round(base * 0.04)}px ${CAPTION_FONT_STACK}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  const title = String(seg.title || '').slice(0, 60);
  ctx.fillText(title, W / 2, H * 0.4 + base * 0.15);
  ctx.font = `500 ${Math.round(base * 0.032)}px ${CAPTION_FONT_STACK}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('No image yet', W / 2, H * 0.4 + base * 0.21);
}

function drawLayer(ctx, layer, plan, images, W, H) {
  const { segment, progress } = layer;
  const img = segment.imageId ? images.get(segment.imageId) : null;
  if (!img) {
    drawPlaceholder(ctx, segment, W, H);
    return;
  }
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const r = sourceRect(iw, ih, W, H, motionTransform(segment.motion, progress, plan.strength), plan.strength);
  ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H);
}

function captionAnchorY(position, blockH, W, H) {
  const tall = H > W;
  if (position === 'top') return H * (tall ? 0.12 : 0.08);
  if (position === 'middle') return (H - blockH) / 2;
  return H * (tall ? 0.8 : 0.9) - blockH;
}

export function drawCaption(ctx, page, alpha, captions, W, H) {
  if (!page || alpha <= 0.001) return;
  const { px, font, lineHeight } = captionFont(captions.size, W, H);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const widths = page.lines.map((l) => ctx.measureText(l).width);
  const padX = px * 0.55;
  const padY = px * 0.32;
  const blockH = page.lines.length * lineHeight + padY * 2;
  const top = captionAnchorY(captions.position, blockH, W, H);
  const cx = W / 2;

  if (captions.style === 'box') {
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    const bw = Math.max(...widths) + padX * 2;
    roundRect(ctx, cx - bw / 2, top, bw, blockH, px * 0.35);
    ctx.fill();
  }
  page.lines.forEach((line, k) => {
    const y = top + padY + lineHeight * (k + 0.5);
    if (captions.style === 'outline') {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, px * 0.18);
      ctx.strokeStyle = 'rgba(0,0,0,0.92)';
      ctx.strokeText(line, cx, y);
    } else if (captions.style === 'shadow') {
      ctx.shadowColor = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur = px * 0.45;
      ctx.shadowOffsetY = px * 0.06;
      ctx.lineWidth = Math.max(1, px * 0.06);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(line, cx, y);
    }
    ctx.fillStyle = captions.color || '#ffffff';
    ctx.fillText(line, cx, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  });
  ctx.restore();
}

const CAPTION_FADE = 0.15;

/**
 * Draws the frame at time t.
 * @param ctx CanvasRenderingContext2D
 * @param state { plan, images: Map<id, drawable>, captionPages, captions }
 */
export function drawFrame(ctx, t, state) {
  const { plan, images, captionPages: pages, captions } = state;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const frame = frameAt(plan, t);
  for (const layer of frame.layers) {
    ctx.globalAlpha = layer.alpha;
    drawLayer(ctx, layer, plan, images, W, H);
  }
  ctx.globalAlpha = 1;
  if (frame.overlay && frame.overlay.alpha > 0) {
    ctx.globalAlpha = frame.overlay.alpha;
    ctx.fillStyle = frame.overlay.color;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (captions?.enabled && pages?.length) {
    const page = pages.find((p) => t >= p.start && t < p.end);
    if (page) {
      const fade = Math.min(1, (t - page.start) / CAPTION_FADE, (page.end - t) / CAPTION_FADE);
      const dim = frame.overlay ? 1 - frame.overlay.alpha : 1;
      drawCaption(ctx, page, fade * dim, captions, W, H);
    }
  }
  return frame;
}
