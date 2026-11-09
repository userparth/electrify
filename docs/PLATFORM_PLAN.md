# Electronics Bench: platform plan

> A complete, interactive electronics-learning product for schools and colleges.
> Solar is now one module. The core is a general circuit workbench with analog parts, digital chips, an Arduino, and real bench instruments.
> Working name: **Electronics Bench** (easy to rename).

## Decisions (8 Nov 2026)

| Topic | Decision |
|---|---|
| Delivery | Cloud website |
| Licence model | **Open source** (decided 9 Nov 2026). No obfuscation; WebAssembly only for speed; accounts/licences only for an optional hosted version |
| Digital scope | Logic gates, 74xx chips, 555 timer, **plus an Arduino Uno that runs student code** |
| Raspberry Pi | **Pi Pico** (full RP2040 emulation via rp2040js, runs MicroPython) and a **Raspberry Pi 4 GPIO header** (student Python with gpiozero/RPi.GPIO, run in the browser via Pyodide and wired to the circuit). Full Linux Pi emulation is not realistic in a browser. |
| Instruments | Multimeter (exists), bench power supply, function generator, 2-channel oscilloscope, logic probe/analyzer, breadboard + jumpers |
| Structure | One app, not one HTML file per page |

## What "secure" can and cannot mean

Anything that runs in a browser can be inspected. The goal is to make copying expensive and useless:

1. **Content stays on the server.** Lessons, part libraries and saved circuits come from authenticated API routes and are never in the public bundle.
2. **Licence checks.** Every request is tied to a school licence (seats, expiry). Middleware blocks unlicensed sessions.
3. **The engine is hard to lift.** The solver moves to Rust → WebAssembly. Client JS is minified and obfuscated in production builds.
4. **Traceability.** Per-school watermark in exported images/PDFs, plus rate limits on content APIs.

## Architecture

pnpm monorepo, TypeScript everywhere. One app, one URL: home `/`, workbench `/workbench`, and the original solar prototype at `/solar` (static files in `apps/web/public/solar/`, see `docs/SOLAR_PROTOTYPE.md`) until it is rebuilt as lessons in phase 7.

```
electronics-bench/
  apps/web/            Next.js (App Router): UI, auth, API routes, teacher dashboard
  packages/engine/     Simulation core (pure TS now, Rust/WASM later)
    analog/            MNA: DC operating point + transient (R, C, L, sources, diode, LED, BJT, MOSFET, switch, pot)
    digital/           Event-driven logic: gates, flip-flops, 74xx, thresholds to/from analog
    mixed/             555 timer, ADC/PWM bridges
    mcu/               ATmega328P via avr8js (Arduino Uno pins ↔ circuit)
  packages/parts/      Part library: pins, model, drawing, specs (served by the API, not bundled)
  packages/instruments/  DMM, PSU, function generator, scope, logic analyzer (React components)
  packages/ui/         Shared design system (hand-inked isometric look from the prototype)
  services/compile/    Arduino compile service (arduino-cli in a container) → .hex
  prisma/              Database schema
```

| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js 16 + React 19 + TypeScript | Server components keep content off the client; API routes in the same app |
| Auth | Auth.js (NextAuth v5) | Email/password and Google for schools; roles |
| Database | PostgreSQL + Prisma | Schools, licences, classes, progress, saved circuits |
| Arduino CPU | avr8js (MIT) | Proven ATmega328P emulator in TypeScript |
| Arduino compile | arduino-cli on a server | avr-gcc can't run in the browser in a practical way |
| Code editor | CodeMirror 6 | Light, good C/C++ highlighting |
| Tests | Vitest | Engine accuracy tests against hand-calculated circuits |

### Data model (first cut)

`School` → `Licence` (seats, expiry) · `User` (role: admin / teacher / student) · `Class` → `Enrollment` · `Module` → `Lesson` · `Progress` (lesson, quiz score, checklist) · `Circuit` (saved workspace JSON, owner, class).

## Product surface

- **Workbench:** free board + breadboard view, part palette, wiring, inspector, instruments docked or floating. This replaces the prototype's `board.html`.
- **Lessons:** guided figures like the prototype's Fig. 01–10. Each is a lesson made of a workbench preset, steps, "try a mistake", a quiz and a practice checklist. No hand-written HTML per lesson.
- **Teacher dashboard:** classes, assign lessons, see progress and quiz scores, share circuits.
- **Modules (first set):**
  1. Basics: voltage, current, resistance, Ohm's law, series/parallel, the multimeter
  2. Analog: capacitors (RC charge, scope), diodes, LEDs, transistors as switches
  3. Digital: gates, truth tables, flip-flops, counters, 7-segment, 555 clock
  4. Microcontrollers: Arduino blink, button input, PWM, analogRead, Serial monitor; Raspberry Pi Pico (MicroPython) and Pi 4 GPIO with Python
  5. Power and solar: the existing solar figures, rebuilt as lessons

## Phases

| # | Phase | Output | Rough size |
|---|---|---|---|
| 0 | Repo + tooling ✅ | Monorepo, typecheck, Vitest, git init (no commits yet) | small |
| 1 | Engine core ✅ (first cut) | MNA DC + transient, diode/LED/BJT/MOSFET/solar, 74xx + 555, PSU + function generator; 20 tests | large |
| 2 | Workbench UI ✅ (first cut) | Breadboard, 37 parts, wiring, palette, inspector, undo/redo, autosave, 4 examples | large |
| 3 | Instruments ✅ (first cut) | Multimeter, function generator, 2-ch scope, 8-ch logic analyzer, logic probe (bench PSU from phase 2); leads are wires whose ends can be dragged between pins | medium |
| 4 | Digital parts ✅ | Gates, 74xx set, 7-segment, 555 · 74HC283 adder, 74HC151 mux, CD4511 decoder, 74HC112 JK, 74HC193 up/down · half-adder and 7-segment decoder lessons | medium |
| 5 | Arduino + Raspberry Pi ✅ (first cut) | Arduino Uno (avr8js, `/api/compile` via arduino-cli, code panel, Serial monitor) · Pi 4 GPIO (Pyodide worker, gpiozero + RPi.GPIO shims) · Pi Pico (rp2040js + MicroPython v1.29, bootrom B1; ~40–65% real time) · I2C/SPI/UART to parts later | large |
| 6 | Platform ✅ | Google sign-in, MySQL progress sync, classes with join codes, lesson assignments, teacher grid, self-serve account deletion (no licences: open source) | large |
| 7 | Content ✅ | Five modules; solar ported as 10 lessons (Fig. 08 shunt monitoring, Fig. 09 second panel added); old `/solar` figures kept as a linked prototype | large |
| 8 | Speed + deploy (in progress) | ✅ Simulation in a Web Worker (UI never blocks) · ✅ Pico USB IRQ storm fixed (sleeping MicroPython ~20× faster, Pico at real time) · ✅ op-amp convergence fix · ✅ hosting + compile rate limit. Rust/WASM only if a circuit needs it (solver is 6–150× real time today) | medium |

## Needs your input later

- **Product name and logo.**
- **Rust toolchain:** installing `rustup` + `wasm-pack` on this Mac is needed for phase 8.
- **arduino-cli:** needed locally for phase 5 (`brew install arduino-cli`).
- **Hosting** (paid): web on Vercel or similar, managed Postgres (Neon/Supabase), and a small VM/container for the compile service.
- **Git:** the new repo needs `git init`. I will ask before every commit.
