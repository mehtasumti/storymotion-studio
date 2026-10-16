# StoryMotion Studio

**Your story. Every scene. Ready to create.**

StoryMotion Studio is a free, browser-only storyboard and prompt creator. Paste a story and get an editable, timed
storyboard: image prompts, image-to-video animation prompts, camera direction, dialogue, voiceover, music/SFX notes
and transitions, ready to use in tools such as Runway or Kling.

> **StoryMotion Studio prepares storyboards and prompts. It does not render videos.**
> Generation is rule-based (templates + text heuristics). It is not an AI model. External video tools have their own
> pricing and usage charges.

- ₹0 to run: no paid APIs, no backend, no database, no accounts, no analytics.
- Everything runs in the browser. Projects are saved to `localStorage`.
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
npm test          # 22 unit tests (engine, timing, validation, JSON round-trip)
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

**Saved data.** `localStorage` key `storymotion-studio:project:v1` holds
`{ schemaVersion, app, settings, scenes, meta, draft, ui, updatedAt }`. Exported JSON has the same
`schemaVersion / settings / scenes / meta / updatedAt` shape and is re-validated on import.

---

## Current limitations

- **Not AI.** The engine cannot understand the story. A one-sentence story gives mostly generic derived beats. Write
  one sentence or line per moment for specific scenes, then edit.
- Prompts are written in English regardless of the Language setting. Language is stored as metadata; your own story
  text and quoted dialogue stay in their original language.
- The PDF uses jsPDF's built-in Latin font. Hindi (Devanagari), Japanese and emoji are replaced with `?` in the PDF
  (the app warns you). JSON export and **Copy all** keep the full text.
- One project at a time per browser. Clearing browser data erases it, so export JSON backups.
- No image or video previews by design.

## Next improvements

1. Multiple saved projects with a project list.
2. Named character profiles (character lock) and reusable style bibles.
3. Add, delete, duplicate and reorder scenes.
4. Embedded Unicode font for Hindi/Devanagari PDF export.
5. Better segmentation: dialogue speaker detection, scene/location headings.
6. Optional "bring your own AI" workflow: copy a ready-made prompt to any chatbot and paste its beats back in, with no
   API keys stored in the app.
7. Paid template packs only after users confirm the free prompts are useful.

## License

Private project. All rights reserved by the owner.
