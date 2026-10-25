# Box Timer

A workout timer for a CrossFit box. Coaches set up a workout on a computer; a phone mounted near the rig runs it full screen, loud and readable from across the room.

**Live:** https://box-timer-yaqbot.web.app
**Stack:** TypeScript (strict) · Vite · Firebase Authentication, Cloud Firestore and Hosting · Vitest

## Try it (for the Yaqbot team)

1. On a computer, open https://box-timer-yaqbot.web.app and **sign in with Google** as `hola@yaqbot.com`.
2. "My workouts" already has three: **Seed AMRAP** (12 min), **EMOM test** (3 × 0:30) and **For Time test** (1 min cap). Create your own with **New workout**.
3. Open a workout and **scan the QR code** with the phone. The phone needs no login.
4. On the phone, turn the volume up, tap **Start**, and leave it.

Any non-@yaqbot.com Google account gets "Access denied".

**iPhone:** Safari doesn't let web pages go full screen. For a true full-screen timer, use Share → **Add to Home Screen** and open it from there. Android goes full screen when you tap Start.

## What it does

**Coach (desktop, @yaqbot.com only)**
- Three modes, each configurable:
  - **For Time:** time cap of 1 to 60 min; counts up.
  - **AMRAP:** duration of 1 to 60 min; counts down.
  - **EMOM:** interval of 0:30 to 5:00, with 1 to 60 rounds; counts down each round.
- Name, notes or movements (shown on the phone), and a countdown before start (0, 5, 10 or 15 s).
- Invalid values are flagged next to the field, and saving is blocked until the form is fixed.
- Save, edit and delete workouts. Each saved workout gets a QR code and a link for the phone.

**Phone timer (no login)**
- Full-bleed phase colours: yellow for get ready, red for work, green for done, grey for paused.
- Huge digits that fit portrait and landscape, a progress ring along the screen edge, elapsed time, round, and time left.
- Beeps: 3-2-1 before every change, a long GO at the start and each new EMOM round, and end beeps. Each beep plays exactly once and is never replayed after a gap.
- Keeps the screen on with the Screen Wake Lock API, re-acquired when the page becomes visible again; NoSleep.js is the fallback for older iPhones.
- Tap to show controls: Pause/Resume, Skip (countdown or EMOM round), Done/Finish, and Reset (needs a second tap).
- Confetti on finish, switched off when the phone has reduce-motion turned on.

## How it works

```
Coach (desktop) ── Google sign-in ──▶ Firebase Auth
       │ save workout
       ▼
   Firestore  workouts/{randomId}   ◀── rules: only verified @yaqbot.com can write or list
       ▲
       │ read by ID (no login)
Phone ── opens /t/{randomId} from the QR code ── runs the timer locally
```

- **The domain rule is enforced on the server**, in `firestore.rules`, not just in the UI. Writes require a signed-in Google account with a verified email ending in `@yaqbot.com` (case-insensitive). Coaches can list and edit only their own workouts, every field is validated, and anyone can read a single workout by its unguessable ID.
- **The timer uses the clock, not a tick counter.** `src/timer/engine.ts` is a pure function, `snapshot(workout, run, now)`, that computes the phase, clock and round from timestamps. A throttled or briefly hidden tab can't drift. Beeps are scheduled ahead of time and fired once per time window, so a skipped frame can't double a beep and a long gap can't replay missed ones.
- **Sound** is synthesised with the Web Audio API, so there are no files to load. The Start tap unlocks audio. On newer iOS versions, the audio session is set to "playback" so the silent switch doesn't mute it.

### Code map

| Path | What |
|---|---|
| `src/workout.ts` | Workout model (one type per mode), validation, formatting |
| `src/coach.ts`, `src/store.ts` | Coach page; Firestore reads and writes |
| `src/auth.ts` | Google sign-in and the domain check in the UI |
| `src/timer/engine.ts` | Pure timer engine: snapshot, pause, skip, finish, beep schedule |
| `src/timer/view.ts`, `audio.ts`, `wakelock.ts`, `confetti.ts` | Phone screen, beeps, keeping the screen awake, finish animation |
| `firestore.rules` | The real access control |
| `scripts/rules-test.mjs` | 32 allow/deny cases against the rules |
| `SPEC.md` | Scope, decisions and acceptance criteria written before coding |

## Testing

| What | How | Result |
|---|---|---|
| Timer engine | `npm test` (Vitest) | 28 tests pass: all modes, pause, skip, finish, beeps once and not replayed |
| Security rules | `npm run test:rules` (Firestore emulator) | 32/32 pass, including Gmail, a look-alike domain, an unverified email, and editing another coach's workout |
| Domain block on production | Signed in with a Gmail account | "Access denied", and a direct write from that account is rejected by Firestore |
| Coach flow | Emulators, signed in as hola@yaqbot.com | Create, validate, save, edit and delete in all 3 modes |
| Real phone | [phone model, browser] | EMOM and For Time beeps and phases correct; [20-min untouched run: result] |

## Run it locally

Requires Node 20+, the Firebase CLI (`npm install -g firebase-tools`), and Java 21 for the emulators.

```bash
npm install
npm run dev          # http://localhost:5173 against the live project
npm test             # engine tests
npm run test:rules   # security rules tests (starts the emulators)
npm run emulators    # terminal A: local Auth + Firestore
npm run dev:emu      # terminal B: app against the emulators (sign in as any test account)
npm run deploy       # build + deploy hosting and rules
```

Emulator code is only included in development builds; production builds never connect to it.

## Decisions and limits

- **Firebase instead of a custom server:** Google sign-in, database and HTTPS hosting in one place, with no auth code of my own to secure. HTTPS is also required for the Wake Lock API.
- **The phone needs no login.** It reads one workout by its random ID. Whoever has the link can see that workout, but nobody can list workouts or write without a @yaqbot.com account.
- **I don't have a @yaqbot.com account**, so the signed-in coach flow was tested on the Firebase emulators, not on production. The production sign-in with `hola@yaqbot.com` is the one path the client tests first.
- **Not built (next steps):**
  - Multi-part sessions (e.g. strength EMOM → rest → metcon): a workout would become a list of parts, and the engine would run them in sequence.
  - More modes (Tabata/intervals).
  - Resuming after a page reload mid-workout.
  - Remote start/pause from the coach's computer.
  - A shared workout library across coaches.
