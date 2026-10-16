import { describe, expect, it } from 'vitest';
import { AiImageError, buildImageUrl, cleanPrompt, errorForResponse, generateImage, seedFor } from './aiImages.js';

const imageResponse = (status = 200, type = 'image/jpeg', size = 4000) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (h) => (h.toLowerCase() === 'content-type' ? type : null) },
  blob: async () => new Blob([new Uint8Array(size)], { type }),
});

describe('AI image requests', () => {
  it('builds a Pollinations URL with size, seed and no key by default', () => {
    const url = new URL(buildImageUrl('A misty  mansion\n at night', { width: 768, height: 1344, seed: 42 }));
    expect(url.origin).toBe('https://gen.pollinations.ai');
    expect(decodeURIComponent(url.pathname)).toBe('/image/A misty mansion at night');
    expect(url.searchParams.get('width')).toBe('768');
    expect(url.searchParams.get('seed')).toBe('42');
    expect(url.searchParams.has('key')).toBe(false);
  });

  it('limits prompt length and gives stable seeds', () => {
    expect(cleanPrompt('x'.repeat(5000))).toHaveLength(1500);
    expect(seedFor('scene-1')).toBe(seedFor('scene-1'));
    expect(seedFor('scene-1', 1)).not.toBe(seedFor('scene-1', 0));
  });

  it('maps HTTP errors to clear messages', () => {
    expect(errorForResponse(401).fatal).toBe(true);
    expect(errorForResponse(402).code).toBe('credit');
    expect(errorForResponse(429, '20').retryAfter).toBe(20);
    expect(errorForResponse(503).code).toBe('server');
  });

  it('refuses to send anything without a key', async () => {
    let called = false;
    await expect(
      generateImage('prompt', {
        key: '',
        fetchImpl: async () => {
          called = true;
          return imageResponse();
        },
      }),
    ).rejects.toBeInstanceOf(AiImageError);
    expect(called).toBe(false);
  });

  it('sends the key as a header, then falls back to ?key= on a network error', async () => {
    const calls = [];
    const blob = await generateImage('prompt', {
      key: 'sk_abc',
      fetchImpl: async (url, init) => {
        calls.push({ url, auth: init.headers?.Authorization });
        if (calls.length === 1) throw new TypeError('Failed to fetch');
        return imageResponse();
      },
    });
    expect(blob.size).toBe(4000);
    expect(calls[0].auth).toBe('Bearer sk_abc');
    expect(new URL(calls[1].url).searchParams.get('key')).toBe('sk_abc');
  });

  it('rejects responses that are not images', async () => {
    await expect(generateImage('prompt', { key: 'k', fetchImpl: async () => imageResponse(200, 'text/html') })).rejects.toThrow(/did not return an image/);
  });
});
