# 1 Bell

1 Bell is a single-kettlebell (30 lb / 13.6 kg) workout web app. It has a 3D coach who demonstrates each move, 20- or 30-minute interval sessions that rotate through five workouts, and a calendar that logs completed sessions.

This app was first built as a claude.ai artifact and then moved here as a plain static site. It has no build step and no dependencies to install.

## Run it

- Quickest: open `index.html` in a browser.
- Better (avoids file:// quirks, and needed for the service worker): `powershell -File .claude/serve.ps1 8000` (neither Node nor Python is installed on this PC), then open http://localhost:8000
- Deploying (Supabase + GitHub Pages + phone install): see `SETUP.md`.

## Files

- `index.html`: the markup. It holds the tabs (Today / Schedule / Moves) and the full-screen workout player overlay.
- `styles.css`: all styling. Colors are CSS custom properties on `:root`. Dark mode redefines them under `prefers-color-scheme: dark` and under `[data-theme="dark"]`.
- `config.js`: Supabase URL + anon key (`window.ONEBELL_CONFIG`). While it holds the `YOUR_...` placeholders, the app runs without accounts.
- `supabase/schema.sql`: the `plans` table (one row per user, `data` jsonb) plus row-level security policies.
- `sw.js`: service worker that caches the app shell and CDN libraries. Bump `VERSION` on every deploy. `manifest.webmanifest` and `icons/` make the app installable.
- `app.js`: all logic, in one IIFE. Its sections are marked with `/* ============ ... ============ */` banners, in this order:
  1. **Mannequin rig (2D)**: forward kinematics plus 2-bone IK in the body's side plane. Units are world units with y up and the floor at y=0. Leg and torso angles are measured from straight up; arm angles from straight down. The near (right) ankle is the root. The `Mannequin` class is an SVG side-view renderer, used only as a fallback when WebGL is unavailable.
  2. **Exercises (`EX`)**: each move has `keys` (pose keyframes), `tempo` (seconds per cycle), `cues`, `tag` and an optional `sided`. Pose fields:
     - `s`, `t`, `b`: shin / thigh / torso angles.
     - `na`, `fa`: near / far arm, either `{u, l}` (upper / lower angles) or `{t:[x,y], k}` (an IK target).
     - `ff`, `ffv`: far-foot target and foot vector.
     - `rx`, `ay`: root offset.
     - `bell`: one of `hang | along | rack | hip | none`.

     Keyframes loop in order with cosine easing.
  3. **3D coach**: Three.js r128 from cdnjs, UMD global `THREE`. `ZC` gives each move the sideways (z) positions of the elbows and hands, and marks the grip as `'two'` or `'one'`. `STYLES` / `styleRoles()` define the coach looks (athlete, wood mannequin, robot, crash dummy); `SKINS` holds the athlete's skin tones. A single shared `WebGLRenderer` draws every view: each `Coach3D` view renders into a viewport and copies the pixels to its own 2D canvas. This keeps the page to one WebGL context, even with 20 library cards. `makeView()` picks 3D, or falls back to the 2D `Mannequin`.
  4. **Workouts / `FORMAT` / `buildSession()`**: workouts A–E, plus the timing of the 20- and 30-minute formats (warm-up, rounds, work/rest, cool-down).
  5. **State + storage**: `state = {days, dur, log:[{d:'YYYY-MM-DD', w:'A', m:20}], coach:{style, skin}}`. Storage has three modes:
     - **Accounts** (`CLOUD`, when `config.js` is filled in): a sign-in gate (`#auth`, `body.gate`) using Supabase email + password: sign in, create an account, and "Forgot password?". A reset link fires `PASSWORD_RECOVERY`, which shows the `#authReset` form. Each user's state is cached in localStorage under `iron-thirty-v1:<uid>`. A `-dirty` flag marks changes the server hasn't confirmed yet. `push()` upserts the user's row in `plans`. `pull()` sends dirty changes, or otherwise takes the server copy; it runs on sign-in, on the `online` event and when the tab becomes visible. On a user's first sign-in, pre-accounts data under `iron-thirty-v1` is adopted and then removed. Sign-out removes that user's cache.
     - **claude.ai**: syncs to the artifact database through `window.claude.use('db')`.
     - **Local only**: localStorage key `iron-thirty-v1` (the original working name, kept so saved data survives the rename).

     `cleanState()` validates any loaded data.
  6. Today view, Schedule view, Moves library, tabs, **Invite + install** and the player. Invite + install covers: the header "Invite friends" button, which uses `navigator.share` and falls back to copying the link; and `#installBar`, which shows an Install button on Android/Chrome via `beforeinstallprompt` and Add to Home Screen steps on iPhone. A dismissed banner stays hidden for 14 days.

     The player covers the timer, beeps via WebAudio, speechSynthesis voice cues and the screen wake lock.
  7. One `requestAnimationFrame` loop that drives the hero, the library cards (every other frame, visible cards only) and the player.

## Conventions

- Keep it dependency-free, apart from the CDN Three.js and Google Fonts (Big Shoulders Display, Public Sans).
- Every color goes through a CSS variable. The 3D floor reads `--floor` from CSS.
- To add an exercise:
  1. Add an entry to `EX` with at least two `keys`.
  2. Add a `ZC` row (elbow and hand z per side, plus grip).
  3. Add it to a workout's `moves` list and to the library `order` array in `renderLib()`.
- To check poses quickly, draw each key with `new Mannequin(el).draw(normalize(key))`.

## Ideas / next steps

- Offer a log export/import as JSON. History saved in the claude.ai version does not carry over to accounts.
- Add Google sign-in (`signInWithOAuth`) as an alternative to email codes.
- Add progression tracking (e.g. reps per interval) and more moves (clean, halo, windmill, Turkish get-up).
