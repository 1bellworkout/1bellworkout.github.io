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
- `supabase/keepalive.sql` + `.github/workflows/keepalive.yml`: the free plan pauses an inactive project. A GitHub Actions routine calls `ping_keepalive()` every day; it updates one timestamp row, and that write is what keeps the project awake (a read-only ping wasn't enough). On the 1st of each month the routine also makes an empty commit, so GitHub doesn't switch off the schedule.
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
  3. **3D coach**: Three.js r128 from cdnjs, UMD global `THREE`. `ZC` gives each move the sideways (z) positions of the elbows and hands, and marks the grip as `'two'` or `'one'`. `STYLES` / `styleRoles()` define the coach looks (athlete, wood mannequin, robot, crash dummy); `SKINS` holds the athlete's skin tones. The picker for these is the `#coachDlg` dialog, opened by the "Change coach" button that replaces the hero stage's "Drag to turn" hint (3D only). A single shared `WebGLRenderer` draws every view: each `Coach3D` view renders into a viewport and copies the pixels to its own 2D canvas. This keeps the page to one WebGL context, even with 20 library cards. `makeView()` picks 3D, or falls back to the 2D `Mannequin`.
  4. **Workouts / `FORMAT` / `buildSession()`**: days A–E. Each day has:
     - its own `warm` list (dynamic, bodyweight moves);
     - its own `cool` list (static stretches for the muscles that day trains);
     - 4 `routines` of 6 moves each, with the day's staple lifts in every routine.

     Log entries store the routine as `v`. The finish screen asks "Did you like this workout?" (`#fRate`) and stores `f` (1 liked, -1 not for me) on that log entry. `routineIndex()` scores each of the day's routines by sessions since it was last done × 1.6 if liked / 0.5 if not, never repeating the last one; with no ratings that's plain rotation. The A–E day rotation itself isn't affected, so muscle groups stay balanced. `FORMAT` sets the 20- and 30-minute formats: how many warm-ups, moves and stretches; work/rest times; and `sw`, the 5 s "switch" break between warm-up moves and between stretches. Stretches last 30 s, or 40 s if one-sided (20 s per side). Segments carry `ph` (warm/main/cool) for the progress bar; `isBreak()` covers both rests and switches.
  5. **State + storage**: `state = {days, dur, log:[{d:'YYYY-MM-DD', w:'A', m:20}], coach:{style, skin}}`. Storage has three modes:
     - **Accounts** (`CLOUD`, when `config.js` is filled in): a sign-in gate (`#auth`, `body.gate`) using Supabase email + password: sign in, create an account, and "Forgot password?". A reset link fires `PASSWORD_RECOVERY`, which shows the `#authReset` form. Each user's state is cached in localStorage under `iron-thirty-v1:<uid>`. A `-dirty` flag marks changes the server hasn't confirmed yet. `push()` upserts the user's row in `plans`. `pull()` sends dirty changes, or otherwise takes the server copy; it runs on sign-in, on the `online` event and when the tab becomes visible. On a user's first sign-in, pre-accounts data under `iron-thirty-v1` is adopted and then removed. Sign-out removes that user's cache.
     - **claude.ai**: syncs to the artifact database through `window.claude.use('db')`.
     - **Local only**: localStorage key `iron-thirty-v1` (the original working name, kept so saved data survives the rename).

     `cleanState()` validates any loaded data.
  6. Today view, Schedule view, Moves library, tabs, **Invite + install** and the player. Invite + install covers: the header "Invite friends" button, which uses `navigator.share` and falls back to copying the link; and `#installBar`, which shows an Install button on Android/Chrome via `beforeinstallprompt` and Add to Home Screen steps on iPhone. A dismissed banner stays hidden for 14 days.

     The player covers the timer, beeps via WebAudio, speechSynthesis voice cues and the screen wake lock. Its progress bar (`buildProgress()` / `renderProgress()`) groups segments into `PHASES`: warm-up, main set (work and rest) and cool-down. Each phase has its own icon and colour token (`--ph-warm/main/cool`). Segment widths follow their seconds, and the header shows the time done and left.
  7. One `requestAnimationFrame` loop that drives the hero, the library cards (every other frame, visible cards only) and the player.

## Conventions

- Keep it dependency-free, apart from the CDN Three.js and Google Fonts (Big Shoulders Display, Public Sans).
- Every color goes through a CSS variable. The 3D floor reads `--floor` from CSS.
- To add an exercise:
  1. Add an entry to `EX` with at least two `keys`.
  2. Add a `ZC` row (elbow and hand z per side, plus grip).
  3. Add it to a routine's `moves`, or to a day's `warm`/`cool` list; give warm-ups the tag `'Warm-up'` and stretches `'Cool-down'`. The Moves library lists every `EX` entry automatically.
- Watch the angle conventions when the torso tilts or lies down. Arm angles are absolute, measured from straight down, with positive meaning toward +x. So lying on the back (`b:-90`) adds 90 to a standing arm angle, and leaning forward (`b:72`) subtracts 72.
- The rig shows one side-on plane. For hands that move sideways, a key can carry `zc` (its own `ZC` row plus a 6th value for bell z); the halo uses this to circle the head. The legs can't do this, so moves like windmills, Russian twists and lateral lunges are left out.
- AMRAP mode is the third option beside 20/30 min, and timed stays the default (`state.dur` is only ever 20 or 30). `buildSession(w, 'amrap', ri)` makes a timed warm-up, one `kind:'amrap'` block of `FORMAT.amrap.amrapSec` that holds every routine move with its `repTarget()` (the routine's `amrap` map, else `reps`, else a default), and a timed cool-down. In the player, Done (the Skip button) steps through moves and counts rounds (`P.am`). When the clock runs out it moves on, and `finish()` logs `r` (rounds completed).
- Day G (Garrett Merrill) is `extra` and holds his routines, taken from his YouTube Shorts transcripts (Days 1–35). Each routine's `note` cites the source day and any moves swapped for ones the rig can show.
- Day F (Bodyweight) is `extra`: it's chosen with the Kettlebell / No bell toggle (`#eqBell` / `#eqBody`) at the top of the Today card, not from the day list below it (which hides while it's chosen). It sits outside the A–E `ROTATION`, and `bw` changes the "Grab your kettlebell" break to "Get ready". A routine can override timing with `format[dur]` (for example `work` as one value per move) and show rep targets with `reps`; the Halo Complex does both. A move with `switchCue` (the halo's "Switch direction") uses that wording at the halfway point instead of "Switch sides".
- Real-person clips: `CLIPS` maps every move id to a YouTube clip `{v, s, e}` (video id, start/end second) plus `day` (Garrett Merrill's Day, used where he does the move) or `by` (another channel's name, for the rest). New moves need a clip too. The real person is the default view: `clipBox()` lays a youtube-nocookie embed over the 3D canvas on the Today stage and in the player, and `showClip()` loads the current move's clip (muted, looping between `s` and `e` via the embed's postMessage API). Its button switches to the 3D coach and back, saved as `state.coach.mode` ('video' | '3d'). The 3D coach shows when that's chosen, when offline, or for a move without a clip. The Moves library cards stay 3D. The times come from his captions. To find more, load a Short in the YouTube player with captions on and capture the timedtext response.
- To check poses quickly, draw each key with `new Mannequin(el).draw(normalize(key))`.

## Ideas / next steps

- Offer a log export/import as JSON. History saved in the claude.ai version does not carry over to accounts.
- Add Google sign-in (`signInWithOAuth`) as an alternative to email codes.
- Add progression tracking (e.g. reps per interval).
