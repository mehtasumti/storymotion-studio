# StoryMotion Studio

**Your story. Every scene. Ready to create.**

StoryMotion Studio is a free, browser-only storyboard, prompt and video maker. Paste a story and get an editable,
timed storyboard (image prompts, image-to-video animation prompts, camera direction, dialogue, voiceover, music/SFX
notes and transitions). Then, in the **Video maker**, add one image per scene plus music and voice recordings, and
export a finished video, rendered on your own device.

> **What the videos are:** animated still images. Each scene is one picture with a camera move (zoom, pan, tilt or
> drift), plus transitions, captions and your audio. Characters and objects do **not** move on their own; this is not
> AI-generated video. For true AI motion, use the animation prompts in tools such as Runway or Kling (paid, separate).
>
> Storyboards are written by rules and templates, not by an AI model.

- ₹0 to run: no paid APIs, no backend, no database, no accounts, no analytics, no server-side rendering.
- Everything runs in the browser. Projects are saved to `localStorage`; images and audio to IndexedDB (also local).
- Optional AI images use **your own free Pollinations key**. They are off by default and only send image prompts.
- Deploys as a static site to the Cloudflare Pages free tier.

---

## Features

- Story input with title, genre/mood, visual style, language and a global character-consistency description
- 4 / 6 / 8 / 10 scenes; 30 / 60 / 90 second targets; 9:16 or 16:9
- 4 visual styles (Cinematic, Anime, 3D Animation, Storybook) and 5 genres (Mystery, Romance, Adventure, Horror, Educational)
- Deterministic generation: the same input always produces the same scenes
- Short stories are padded with clearly labeled **derived beats** (establishing, reaction, discovery, build-up, lead-in,
  consequence, closing) instead of repeating sentences or inventing plot facts
- Quoted dialogue in your story is preserved; dialogue is never invented
- Integer durations that always sum exactly to the target, with continuous start/end times
- Per-scene duration editing with **Lock total** (the other scenes rebalance) or free mode plus a **Rebalance** button
- Every scene field is editable; copy buttons per field, per scene and for the whole storyboard
- Autosave in the browser, JSON export/import (validated), multipage PDF export
- Warnings before overwriting edited work; recovery from corrupted or unavailable storage
- Keyboard accessible, screen-reader labels and live status messages, responsive down to 320 px

### Video maker (new in 0.2)

- **Images:** upload, replace, preview, remove and swap one image per scene (drag-and-drop, or "Add several images"
  to fill scenes in file-name order). Large images are resized to 2560 px on the long edge. A scene without an image
  shows a titled placeholder card.
- **Camera animation:** zoom in, zoom out, pan left/right, tilt up/down, cinematic drift or static. "Auto" picks the
  move from the storyboard's camera direction (e.g. *push-in* → zoom in, *tilt up* → tilt up, *tracking* → pan
  right). Override per scene; set the strength (subtle / normal / strong) for all scenes. Pans never show empty edges.
- **Timeline:** uses the storyboard's exact scene durations. Transitions follow each scene's transition field:
  dissolve / cross-fade blend scenes, fade to black / white fade through a colour, and cuts are frame-exact. The total
  length never changes. Optional fade-in from black.
- **Preview:** play, pause, scrub, jump to any scene; audio plays in sync (the audio clock drives the picture).
- **Audio:** background music (loop, start offset, automatic fade in/out), plus a narration and a dialogue clip per
  scene (volume, start delay, trim at scene end or let it continue). Separate music / narration / dialogue levels and
  automatic music ducking under voices. A limiter prevents clipping.
- **Captions:** generated from each scene's dialogue and voiceover (choose the source), editable per scene, with size,
  position (bottom keeps clear of app buttons on 9:16), style (dark box, outline, soft shadow), colour and uppercase.
  Long captions become pages of up to two lines, broken at natural phrase points and timed across the scene.
- **Export:** WebM (VP9 + Opus) or MP4 (H.264 + AAC), 720p or 1080p, 30 fps, with progress, cancel and retry. Every
  file is read back and checked (length, size, tracks, playable) before you download it, so the app never claims a
  format that did not work.
- **Optional AI images (Pollinations):** off by default; requires your own free key and an explicit opt-in. Generate one
  scene or all missing scenes; clear messages and Retry for failures (bad key, no credit, rate limit, offline).

---

## Run it locally on Windows

### 1. Install the free prerequisites (once)

- **Node.js 22 LTS** (or any version ≥ 20.19): https://nodejs.org
- **Git**: https://git-scm.com/download/win
- **VS Code** (optional): https://code.visualstudio.com

Check them in **PowerShell**:

```powershell
node --version
npm --version
git --version
```

### 2. Unzip and install

Unzip `storymotion-studio.zip` (for example to `C:\Projects\storymotion-studio`), then:

```powershell
cd C:\Projects\storymotion-studio
npm install
```

If PowerShell says *running scripts is disabled on this system*, run this once, then retry:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### 3. Start the app

```powershell
npm run dev
```

Open the address it prints, usually **http://localhost:5173**. Press `Ctrl + C` in PowerShell to stop it.

Try it fast: click **Demo: one-line test** or **Demo: detailed beats**, then **Generate Storyboard**.

### 4. Tests and production build

```powershell
npm test          # 50 unit tests (engine, timing, JSON, video plan, captions, audio sync, AI image client)
npm run build     # production build into the dist folder
npm run preview   # serve the production build at http://localhost:4173
```

### Test on your phone (same Wi-Fi)

```powershell
npm run dev -- --host
```

Open the **Network** URL it prints on your phone. Windows Firewall may ask for permission the first time; allow it
on private networks.

---

## Making a video

1. Generate a storyboard, then click **Video maker** (next to Storyboard, under the storyboard title).
2. **Scenes & images:** add an image to each scene. Create them in any free image tool using each scene's image
   prompt (copy it from the Storyboard tab), or turn on **AI images**.
3. Check each scene's **Camera animation** and **Caption**; add narration/dialogue under **Voice clips**.
4. **Music & audio:** upload background music (use music you have the rights to) and balance the levels.
5. **Captions & motion:** style the captions and choose the motion strength.
6. Press play on the preview, then **Create WebM/MP4 video** and **Download video**.

### Browser support for export

| Browser (desktop) | WebM | MP4 (H.264 + AAC) | Speed |
|---|---|---|---|
| Chrome / Edge 94+ on Windows or macOS | ✔ | ✔ (normally) | Faster than real time |
| Firefox 130+ | ✔ | Depends on the system's H.264/AAC encoders | Faster than real time |
| Safari 16.4+ | Depends on version | Depends on version | Fast, or real-time recording |
| Browsers without WebCodecs | ✔ via real-time recording, if MediaRecorder supports it | Sometimes | Takes as long as the video |

The app tests your browser before export, only offers formats that work, and verifies the finished file. A
60-second 720p video exports in roughly 20–60 seconds on a typical laptop. Phones work, but are slower and may run out
of memory at 1080p; use 720p. WebM plays in Chrome, Edge, Firefox and VLC and uploads to YouTube; prefer MP4 for
Instagram and phone galleries.

### Optional AI images (Pollinations)

Pollinations no longer allows anonymous image generation; it needs a key from a free account you create yourself.

1. Open **https://enter.pollinations.ai**, sign in (free) and create an API key.
2. In StoryMotion: **Video maker → AI images**, read the notice, tick the box, **Turn on AI images**, and paste the key.
3. Click **Generate missing** (or Generate / Regenerate on a scene).

Only each scene's image prompt (which includes your character descriptions), the image size and a seed are sent to
Pollinations. Your story, audio and uploaded images are not. Free usage is limited by Pollinations and may change;
when it runs out you'll see a clear message, and uploading images always works. The key is kept only in this tab
unless you tick "Remember". "Turn off AI images" deletes it. StoryMotion never charges you.

---

## Push to GitHub

Repository: https://github.com/mehtasumti/storymotion-studio

From the project folder:

```powershell
git init
git add .
git commit -m "Initial StoryMotion Studio MVP"
git branch -M main
git remote add origin https://github.com/mehtasumti/storymotion-studio.git
git push -u origin main
```

If the folder is already a Git repository (it is, when it came from the zip), skip `git init` and the commit, and
only run the `remote add` and `push` lines. If `remote add` says the remote already exists, run
`git remote set-url origin https://github.com/mehtasumti/storymotion-studio.git` instead.

If your GitHub repository was created with a README or license, run this before pushing:

```powershell
git pull origin main --allow-unrelated-histories
```

## Deploy free on Cloudflare Pages

1. Sign in at https://dash.cloudflare.com (free account, no card needed for Pages).
2. Go to **Workers & Pages → Create → Pages → Connect to Git**, and authorize GitHub.
3. Pick `mehtasumti/storymotion-studio`.
4. Settings:
   - Framework preset: **Vite** (or None)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Production branch: `main`
   - Environment variable (optional): `NODE_VERSION` = `22`
5. Click **Save and Deploy**. Your site appears at `https://<project-name>.pages.dev`.
6. Every `git push` to `main` redeploys automatically.

`public/_headers` adds security headers (Content-Security-Policy, no framing, no camera/mic/location) on Cloudflare
Pages. Use Cloudflare Pages rather than GitHub Pages for this site.

After deploying, check: generate a storyboard, edit a field and reload, export and re-import JSON, export PDF, and
open the site on your phone.

---

## Architecture

```text
storymotion-studio/
├── public/
│   ├── favicon.svg
│   └── _headers               Cloudflare Pages security headers
├── src/
│   ├── components/
│   │   ├── video/             Video maker: VideoStudio, VideoPreview, SceneMediaRow, AudioPanel,
│   │   │                      CaptionPanel, AiImagePanel, ExportPanel
│   │   ├── StoryForm.jsx      story + settings form, demo presets
│   │   ├── Storyboard.jsx     toolbar, notices, timeline controls, scene list
│   │   ├── Timeline.jsx       proportional scene bar and total indicator
│   │   ├── SceneCard.jsx      editable scene fields + duration control
│   │   └── CopyButton.jsx     clipboard button with feedback
│   ├── lib/
│   │   ├── storyEngine.js     validation, beat extraction, templates, timing (pure)
│   │   ├── projectJson.js     JSON schema, import validation, export helpers
│   │   ├── storage.js         versioned localStorage with corruption/quota handling
│   │   ├── exportPdf.js       jsPDF multipage export (lazy-loaded)
│   │   ├── format.js          time formatting, plain-text export, PDF-safe text
│   │   ├── clipboard.js       Clipboard API + fallback
│   │   ├── demoPresets.js     demo inputs only (nothing hardcoded in the engine)
│   │   ├── video/videoModel.js   render plan: motion, transitions, caption pages, audio schedule (pure)
│   │   ├── video/renderer.js     canvas drawing shared by preview and export
│   │   ├── video/audioEngine.js  Web Audio scheduling (live preview + offline mix)
│   │   ├── video/exporter.js     WebCodecs/Mediabunny export, MediaRecorder fallback, verification
│   │   ├── video/mediaStore.js   IndexedDB storage for images/audio
│   │   ├── video/mediaFiles.js   image/audio import, decoding and caches
│   │   ├── video/aiImages.js     optional Pollinations client
│   │   └── *.test.js          Vitest tests
│   ├── App.jsx                state, autosave, import/export, reset
│   ├── App.css                dark cinematic theme
│   └── main.jsx
├── index.html
├── package.json
└── vite.config.js
```

**How generation works.** `generateStoryboard(settings)` in `storyEngine.js`:

1. Validates and normalizes input.
2. Splits the story into beats by line and sentence (quote- and abbreviation-aware). If there are fewer beats than
   scenes, it splits long sentences at clauses (`, and`, `where`, `when`…).
3. If there are still too few, it places the story beats across the timeline and fills gaps with labeled derived beats
   that reference the neighbouring story text.
4. Applies templates for shot type (with keyword overrides, e.g. *letter* → insert close-up), style, genre mood and
   lighting, aspect-ratio composition, environment motion, SFX keywords and transitions.
5. Distributes the duration as integers that sum exactly to the target and computes continuous times.

Apart from IDs and the timestamp, it is a pure function and is unit-tested.

**How video works.** `buildVideoPlan()` turns the scenes and video settings into segments with exact start/end
times, a camera motion and an outgoing transition. `drawFrame(t)` draws any moment onto a canvas, and both the
preview and the exporter call it, so the download matches the preview. Audio clips are scheduled from scene start
times. The preview uses the Web Audio clock as its master clock; export renders the full mix with an
`OfflineAudioContext` (sample-accurate) and encodes video frame by frame with WebCodecs through
[Mediabunny](https://mediabunny.dev) (MPL-2.0, free). If WebCodecs is missing, the canvas is recorded in real time with
`MediaRecorder` and remuxed so the file is seekable.

**Saved data.** `localStorage` key `storymotion-studio:project:v1` holds
`{ schemaVersion, app, settings, scenes, meta, video, draft, ui, updatedAt }`, where `video` holds only references and
settings. Images and audio are blobs in the IndexedDB database `storymotion-studio-media`. Exported JSON (schema 2)
contains the storyboard and video settings but **not** the image/audio files; schema-1 files still import.

---

## Current limitations

- **Videos are animated stills**, not AI motion: no moving characters, lip-sync, generated voices or sound effects.
- JSON export does not include images or audio. Keep your original files; after importing on another device, add them
  again (scenes show "Image not in this browser").
- Voice recordings are added per scene. One long narration file can go on scene 1 with "Let it continue into the next
  scenes".
- MP4 depends on the browser having H.264 and AAC encoders; the app hides MP4 when it can't make it.
- Real-time recording (fallback browsers) must keep the tab visible, and can be up to one frame off at hard cuts.
- Optional AI images depend on Pollinations' free limits, availability and terms, which can change.

- **Not AI.** The engine cannot understand the story. A one-sentence story gives mostly generic derived beats. Write
  one sentence or line per moment for specific scenes, then edit.
- Prompts are written in English regardless of the Language setting. Language is stored as metadata; your own story
  text and quoted dialogue stay in their original language.
- The PDF uses jsPDF's built-in Latin font. Hindi (Devanagari), Japanese and emoji are replaced with `?` in the PDF
  (the app warns you). JSON export and **Copy all** keep the full text.
- One project at a time per browser. Clearing browser data erases it, so export JSON backups.
- No image or video previews by design.

## Next improvements

1. "Export project with media" as a single file (zip) so images/audio travel with the JSON.
2. A full-length narration track lane, with automatic scene timing from narration length.
3. Burned-in subtitle export as .srt/.vtt alongside the video.
4. Multiple saved projects with a project list.
2. Named character profiles (character lock) and reusable style bibles.
3. Add, delete, duplicate and reorder scenes.
4. Embedded Unicode font for Hindi/Devanagari PDF export.
5. Better segmentation: dialogue speaker detection, scene/location headings.
6. Optional "bring your own AI" workflow: copy a ready-made prompt to any chatbot and paste its beats back in, with no
   API keys stored in the app.
7. Paid template packs only after users confirm the free prompts are useful.

## License

Private project. All rights reserved by the owner.
