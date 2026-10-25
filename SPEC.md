# Box Timer: project spec

Take-home for Yaqbot (client: a CrossFit box). Deadline: **Sunday 25 Oct, 23:59 Spain time.**
Time budget: about 2.5 hours. Rule from the brief: *smaller and working on a real phone beats bigger and broken.*

---

## 1. Goal

Coaches set up a workout on a computer before class. During class, a phone mounted near the rig runs the timer full screen, readable from a few metres away, with sound cues. Nobody touches the phone during the session.

## 2. Users and flows

| Who | Where | What they do |
|---|---|---|
| Coach | Desktop browser | Signs in with Google (@yaqbot.com only). Creates or edits a workout. Opens it on the phone. |
| Phone by the rig | Mobile browser | Opens the workout link (QR code). Taps **Start** once. Then it runs alone. |
| Athletes | 3–5 m away | Read the clock and phase; hear the beeps. |

**Main flow**
1. Coach signs in → sees "My workouts" → **New workout**.
2. Picks a mode and fills in its settings → **Save**.
3. Page shows a QR code and a short link → coach scans it with the phone.
4. Phone shows the workout summary and a big **Start** button → tap → 10 s countdown → workout runs → "DONE" screen.

## 3. Minimum requirements (from the brief); all must pass

- **R1 Desktop setup:** at least three modes (For Time with cap, AMRAP, EMOM), each configurable.
- **R2 Desktop to phone:** the configured workout gets onto the phone.
- **R3 Timer:** full screen, readable from a few metres, sound cues, keeps running for a full session untouched.
- **R4 Access:** only @yaqbot.com Google accounts can configure; tested with `hola@yaqbot.com`.
- **R5 Online:** reachable at a public URL.

## 4. Scope

**Must (MVP)**
- Three modes: For Time, AMRAP, EMOM.
- Google sign-in, @yaqbot.com only, enforced **on the server side** (database rules), not only in the UI.
- Workouts saved online; the phone loads them by link or QR code.
- Phone timer: full screen, huge digits, phase colours, beeps, screen kept awake.
- Deployed on a public HTTPS URL.

**Should (only once every Must works on a real phone)**
- Pause / resume on the phone (tap to show controls).
- "Done" button for For Time (stops the clock, shows the athlete's time).
- Edit and delete saved workouts.
- Survive a page reload mid-workout (resume at the right time).

**Won't (out of scope; mention as "next steps" in the notes)**
- Multi-part sessions, Tabata / custom intervals, athlete scores, remote control from the desktop, offline mode / PWA install, multiple coaches sharing a library with permissions.

## 5. Modes and settings

| Mode | Settings (validation) | Clock | Ends when |
|---|---|---|---|
| **For Time** | Time cap: 1–60 min | Counts **up** from 0:00 | Cap reached, or coach taps **Done** |
| **AMRAP** | Duration: 1–60 min | Counts **down** | Reaches 0:00 |
| **EMOM** | Interval: 30 s–5 min (default 1:00); Rounds: 1–60 | Counts **down** each interval; shows "Round 3 / 10" | Last round ends |

Shared settings: workout **name** (required, max 60 chars), optional **notes / movements** (max 240 chars, shown on the phone), **countdown** before start (default 10 s; 0, 5, 10 or 15).

Invalid input is blocked with a clear message next to the field. Saving is not possible until the form is valid.

## 6. Timer behaviour rules

1. **Time comes from the clock, not from counting ticks.** Store `startedAt` (and pause time); on every frame compute `elapsed = now − startedAt − pausedTotal`. A throttled or briefly hidden tab can never drift.
2. **Update the display about 10× per second**, but only change the DOM when the shown second changes.
3. **Phases and colours** (fill the whole screen):
   - Get ready: **yellow** background, dark digits
   - Work: **red**
   - Rest / between EMOM rounds: not needed (EMOM has no rest phase)
   - Paused: **dark grey**, "PAUSED"
   - Done: **green**, "DONE"
4. **Sound cues** (Web Audio API, synthesised beeps; no audio files):
   - Short beep at 3, 2, 1 seconds before every phase change
   - Long high beep on GO, and at every new EMOM round
   - Three beeps at the end
   - Each beep plays **exactly once**, even if a frame is skipped. After a long gap, don't replay missed beeps.
5. **Audio unlock:** browsers only allow sound after a tap. The **Start** tap must also unlock audio. Provide a "Test sound" button on the start screen.
6. **Keep the screen on:** Screen Wake Lock API on Start. Re-acquire it when the page becomes visible again. If it isn't supported (older iOS), use the NoSleep.js fallback. If both fail, show a small note: "Set Auto-Lock to Never".
7. **Full screen:** request the Fullscreen API on the Start tap (works on Android). iPhone Safari has no Fullscreen API for pages: support "Add to Home Screen" (`apple-mobile-web-app-capable` meta tags) and show a one-line hint on iPhone.
8. **Readability:** digits use the largest size that fits (about 40%+ of the screen height in landscape, full width in portrait). Bold, condensed font, tabular numbers. Minimum contrast 4.5:1. Works in portrait and landscape.
9. **No accidental input:** while running, the screen shows only the clock. A tap reveals the controls for 5 s. "Reset" needs a second tap to confirm.

## 7. Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere (strict mode) | Type safety; the brief leaves the stack open |
| Frontend | **Vite + TypeScript**, no heavy UI framework (or React if preferred; decide once and keep it) | Fast setup, small bundle, quick on phones |
| Auth | **Firebase Authentication**, Google provider | Google sign-in in minutes; no custom auth server to secure |
| Database | **Cloud Firestore** | Coach saves → phone reads by ID; free tier is plenty |
| Hosting | **Firebase Hosting** (HTTPS by default) | One tool for auth, database and hosting; HTTPS is required for Wake Lock |
| Desktop → phone | Saved workout gets an ID → link `/t/<id>` + **QR code** on the desktop | No typing on the phone; the phone needs no login |
| Domain rule | Checked in **Firestore security rules** (server side) *and* in the UI (for a clear message) | A UI-only check can be bypassed; the rules are the real lock |
| Timer logic | **Pure function** `snapshot(workout, runState, now)` in its own module, with unit tests (Vitest) | Easy to test without a browser; easiest part to explain in the call |

### Firestore data model

```
workouts/{workoutId}
  name: string
  mode: "fortime" | "amrap" | "emom"
  capSec?: number        // fortime
  durationSec?: number   // amrap
  intervalSec?: number   // emom
  rounds?: number        // emom
  countdownSec: number
  notes: string
  ownerEmail: string
  createdAt, updatedAt: timestamp
```

### Security rules (intent)

- **Read** a workout: anyone with its ID (the phone has no login; IDs are random and unguessable).
- **Create / update / delete:** only if signed in **and** `request.auth.token.email_verified == true` **and** the email ends with `@yaqbot.com`.
- **List** workouts: only signed-in @yaqbot.com users.
- Validate field types and ranges in the rules too.

## 8. Design direction

- **Desktop (coach):** a clean, light form. Mode picked with three large segmented buttons. Live summary on the side ("AMRAP 12:00, 10 s countdown"). After saving: a big QR code and a "Copy link" button.
- **Phone (timer):** dark at rest, full-bleed phase colour when running. One huge clock, the phase label at the top ("AMRAP", "EMOM · Round 3 / 10"), notes at the bottom. Nothing else on screen.
- Plain, specific copy in sentence case. Buttons say what they do ("Save workout", "Start").
- Respect `prefers-reduced-motion`. Visible keyboard focus on desktop.

## 9. Acceptance criteria (test each one, on a real phone where marked 📱)

- [ ] **AC1** `hola@yaqbot.com` (or any @yaqbot.com account) can sign in on the deployed URL.
- [ ] **AC2** A @gmail.com account is refused with a clear message, **and** a direct Firestore write from that account fails (rules tested).
- [ ] **AC3** Coach can create, save and reopen a workout in each of the 3 modes; invalid values are blocked.
- [ ] **AC4** 📱 Scanning the QR code opens the workout on the phone with no login.
- [ ] **AC5** 📱 Start → 10 s countdown with 3-2-1 beeps → GO beep → correct clock direction for the mode.
- [ ] **AC6** 📱 EMOM beeps at each new round and shows "Round n / N"; ends after the last round.
- [ ] **AC7** 📱 For Time counts up and stops at the cap (and at **Done**, if built).
- [ ] **AC8** 📱 The digits are readable from 3 m away, in portrait and landscape.
- [ ] **AC9** 📱 A 20-minute AMRAP runs to the end with the phone untouched: the screen never turns off, the clock is accurate within 1 s against a stopwatch.
- [ ] **AC10** The app is live on a public HTTPS URL, and the repo is on GitHub with a README (how to run, deploy, decisions).
- [ ] **AC11** Timer engine unit tests pass (`npm test`).

## 10. Milestones (timeboxed)

| # | Milestone | Done when | Budget |
|---|---|---|---|
| M1 | Scaffold: Vite + TS, Firebase project connected, deployed "hello" page | Public URL loads | 20 min |
| M2 | Google sign-in + domain restriction + Firestore rules | AC1, AC2 | 25 min |
| M3 | Coach form: 3 modes, validation, save/list, QR code | AC3, AC4 | 30 min |
| M4 | Timer engine (pure function + tests) | AC11 | 20 min |
| M5 | Phone timer UI: full screen, colours, beeps, wake lock | AC5–AC8 | 30 min |
| M6 | Real-phone test, fixes, README, notes | AC9, AC10 | 25 min |

**If time runs out:** cut Should items first, never Must items. Deploy after every milestone so there is always a working URL.

## 11. Working rules for the AI assistant

1. Read this spec first. If something in it is unclear or conflicts, **ask before coding**.
2. Work **one milestone at a time**. Before coding, state the plan in a few bullets; after coding, say how to verify it.
3. Keep changes small and focused. Commit after each milestone with a clear message.
4. **No new dependencies without saying why.** Prefer the platform (Web Audio, Wake Lock, Fullscreen).
5. TypeScript strict mode; no `any` unless justified.
6. Never put secrets in the repo. Firebase web config is public by design; security comes from the rules.
7. When I report a bug: find the cause first, explain it in one or two sentences, then propose the smallest fix.
8. Don't mark something done until it has been verified (test passes, page checked, or I confirm on my phone).
