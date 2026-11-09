# Electronics Bench: production plan

> Goal: a product that any student anywhere can open, understand in a minute, and keep learning on, with or without a teacher.
> Written 10 Nov 2026. Live: https://electrify.getparth.com · Code: https://github.com/userparth/electrify

## Where we are

| Area | Today |
|---|---|
| Learning | 37 auto-checked lessons in 5 modules (Basics 3, Analog 7, Digital 9, Microcontrollers 8, Solar 10) |
| Bench | 2D editor + isometric 3D (build and view), Arduino / Pico / Pi 4 running real code, instruments |
| Accounts | Google sign-in only; progress sync; classes, join codes, assignments; self-serve deletion; per-user theme and font |
| Devices | Desktop and a phone layout (tap-to-add, Wire mode with loupe); no offline support |
| Infra | Static site + PHP on Hostinger shared hosting; MariaDB; arduino-cli on the same box (2 compile slots) |
| Quality | Unit and lesson-playthrough tests (engine 22, parts 71, web 52); no CI, no end-to-end tests, no error tracking |
| Gaps | No first-run guidance, no learner dashboard, no backups, no CSP, no 404/error pages, English only |

The biggest gap for a worldwide audience: **a student who arrives alone has no guide**. The lessons list is the only entry point, nothing says where to start, and the bench is dense on first sight.

## Principles

1. **Learn first, account later.** Everything works without signing in; signing in only adds sync. No wall before the first circuit.
2. **One-minute win.** A new student lights an LED within 60 seconds of arriving.
3. **Self-paced by default.** Teachers and classes are an optional layer, never required.
4. **Works on a cheap phone on a slow connection.** Small first load, heavy parts (Pyodide, MicroPython, compiler) only when asked for.
5. **Private by default.** No ads, no third-party trackers; only the data listed in the privacy policy.

---

## Phase A: Onboarding and the learner home (first)

### A1. First-run onboarding (about 60–90 seconds, skippable at every step)

| Step | Screen | Saved as |
|---|---|---|
| 1 | **Welcome**: one sentence + a live mini circuit (LED lights when you tap the switch) | – |
| 2 | **Who are you?** School student · College / university · Hobbyist / maker · Teacher | `profile.role` |
| 3 | **What do you want to do?** (pick any) Understand the basics · Build with Arduino / Pi · Digital logic · Solar and power · Just explore | `profile.goals[]` |
| 4 | **Your level**: New to electronics · I know Ohm's law · I've built circuits | `profile.level` |
| 5 | **Look and feel**: theme and font (the existing settings, shown as cards) | `settings` |
| 6 | **Your path**: a recommended first lesson and the next 3, with a big "Start" button | `profile.path[]` |

- Stored locally; copied to the account on sign-in (same pattern as settings). Can be redone from Settings → "Redo onboarding".
- Teachers who pick "Teacher" get a short extra step: "Create a class now or later".
- Shown once: on first visit to `/`, `/learn` or `/workbench`. A lesson link opened directly (e.g. shared by a teacher) skips straight to the lesson and offers onboarding afterwards.

### A2. Guided bench tour (first time the bench opens)

Five coach marks on the real bench, each waiting for the action rather than a "Next" button: add a part → place it on the breadboard → draw a wire → press Run → open the meter. Separate short versions for phone (tabs, Wire mode, loupe) and desktop (drag, Shift-drag, 2D/3D).

### A3. Learner home (`/` for returning students)

- **Continue**: the lesson in progress, one tap back in.
- **Your path**: next lessons from onboarding, with module progress rings.
- **Achievements**: module badges and a shareable completion certificate per module (later: verifiable link).
- **Quick bench**: open a blank bench or a recent circuit.
- New visitors still see the public landing page; returning ones see their home.

### A4. Lesson flow polish

Prerequisites shown on each lesson, estimated time, a "stuck?" button that reveals hints step by step, and a short recap card at the end with "Next lesson".

---

## Phase B: Launch blockers (production basics)

### B1. Reliability and operations
- **CI** (GitHub Actions): typecheck, unit + lesson tests, static build on every push; deploy only from a green `main`.
- **End-to-end tests** (Playwright): onboarding, a full lesson, phone layout, Wire mode, sign-in mock, settings.
- **Error tracking**: a tiny `/api/error.php` collecting front-end errors (message, stack, page, build id; no personal data) + a daily summary; or a self-hosted Sentry/GlitchTip.
- **Uptime check** on `/`, `/api/me.php`, `/api/compile.php`.
- **Database backups**: nightly `mysqldump` to a second location, 30-day retention, restore tested once.
- **Staging**: `staging.electrify.getparth.com` with its own database; every deploy goes there first.
- **Versioned releases**: build id in the footer and in error reports; changelog.

### B2. Security
- **CSP** and security headers (`Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`, HSTS).
- **Rate limits** on every API (sign-in, join-class code guessing, progress writes, settings), not only compile.
- Session hardening review (rotation, idle timeout), dependency audit in CI, PHP version pinned.
- Class names and display names: length limits and basic filtering (students see each other's names in classes).

### B3. Capacity
- The compiler runs on shared hosting with 2 slots. For a public launch move **arduino-cli to a small VPS/container** with a queue and per-IP limits, keeping the shared host for the static site and PHP; or cache every lesson sketch at build time so most compiles are cache hits.
- CDN in front of static files (Hostinger CDN or Cloudflare) with long cache on hashed assets and short cache on HTML.

### B4. Error and empty states
Custom 404 and error pages, offline banner, compiler-busy message with retry, "your browser can't run Python here" explanations, and loading skeletons for the bench.

### B5. Privacy and legal for a worldwide, young audience
- **Age**: onboarding asks only "Are you 13 or older?". Under 13 (or under the local age of consent): full use without an account; sign-in hidden unless a teacher's class invites them. (COPPA, GDPR-K, India's DPDP Act.)
- **Data export** ("Download my data") next to "Delete my account".
- Privacy policy updated for onboarding answers, settings and error reports; terms reviewed.
- Cookies: only the essential session cookie, so no consent banner is needed; keep it that way.

### B6. Accessibility (WCAG 2.2 AA)
Keyboard operation of the bench (select, move, wire with arrow keys), visible focus, text descriptions of circuits for screen readers ("LED D1 is lit, 9 mA"), contrast check of all five palettes, `prefers-reduced-motion` (wobble, loupe animation, pulses), and captions/alt text in lessons.

---

## Phase C: Reach and growth

- **Sign-in beyond Google**: email one-time code (works for students without a Google account and in countries where Google is blocked); maybe GitHub/Apple later.
- **Languages**: i18n framework for all UI and lesson text, then translations (Hindi first is natural; Spanish, Portuguese, Arabic, Indonesian have the most students). Right-to-left support for Arabic/Urdu. Numbers and units formatted per locale.
- **Offline / PWA**: installable app; lessons, bench and MicroPython cached for offline use; progress syncs when back online (schools with poor internet).
- **Save and share circuits**: named circuits in the account, share by link, "open in bench" from any lesson.
- **Landing page and SEO**: a real landing page (demo video/GIF, what you can build, for students/teachers), per-lesson pages with meta and social images, sitemap, structured data.
- **Privacy-friendly analytics**: self-hosted, cookieless (e.g. Umami) or our own event endpoint; onboarding funnel, lesson drop-off, device mix. No personal data.
- **Feedback**: a "Report a problem / idea" button on every page, sending page, build id and an optional screenshot.

## Phase D: Depth

More lessons (sensors, motors and H-bridges, I2C/SPI parts, power electronics), challenges with no step-by-step ("make the LED fade without an Arduino"), a free-build gallery, verified certificates, teacher analytics. Community contributions to lessons via GitHub, with a lesson authoring guide.

---

## Suggested order

| # | Work | Why first |
|---|---|---|
| 1 | A1 onboarding + A2 bench tour | The biggest gap for students who arrive alone |
| 2 | A3 learner home + A4 lesson polish | Keeps them coming back |
| 3 | B1 CI, backups, error tracking, staging | Safe to change things once real users depend on it |
| 4 | B2 security headers + rate limits, B4 error states | Launch blockers |
| 5 | B5 age and privacy, B6 accessibility basics | Required for a young, worldwide audience |
| 6 | B3 compiler capacity | Before any public promotion |
| 7 | Phase C items in the order of the decisions below | Reach |

## Decisions (10 Nov 2026)

| Topic | Decision |
|---|---|
| Sign-in | Add **email one-time-code** sign-in next to Google |
| Languages | **Set up i18n now**, translate later; all new text goes through it from day one |
| Under-13 | **No account, everything else**: full use without signing in; sign-in hidden for them |
| Order | **Onboarding + bench tour first**, then production basics (B1–B2), each tested and deployed on its own |
| Hosting, analytics | Open; decide before a public launch |
