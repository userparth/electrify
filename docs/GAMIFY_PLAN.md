# Electronics Bench: game-style start ("Spark Quest")

> Written 10 Nov 2026, after testing with two students: they did not enjoy it and did not understand what to do.

## Why the start fails today

Lesson 1 ("Your first circuit") asks a beginner to do the hardest things first:

| Problem | Where |
|---|---|
| Starts with a breadboard lecture (holes joined inside, rails) before anything happens | Step 1 |
| Several concepts at once: breadboard columns, LED polarity, resistor, wires, rails | Steps 2–4 |
| Long paragraphs; students do not read them | Every step |
| The goal is described in words, not shown | Every step |
| The full bench (many parts, menus, 2D/3D) is open from second one | Bench |
| A mistake gives no feedback; the LED just stays dark | Step 4 |
| No reward: a tick and the next paragraph | Every step |

## What the testers said (10 Nov 2026)

| Tester | Said | What it means |
|---|---|---|
| Vicky | Hard to use; make it feel like a game | Game-style start (below) |
| Vicky | Too much searching; interest drops in that time | Show exactly where the part is; fewer parts on screen |
| Vicky | Show a video or GIF that builds a sample circuit | "Show me" demo per step (below) |
| Vicky | Picking an example draws the whole circuit at once; animate it instead: where each part came from, where the instruction is read | Examples and lessons build themselves step by step |
| Guddu | A sample video would help | Same as above |
| Guddu | Stuck on "Your first circuit" (phone, 3D, Wire mode): battery wired to the breadboard, did not know what to do next | On a phone the lesson text is hidden behind the Lesson tab while building; the current step must always be on screen |
| Guddu | Zero circuit knowledge, struggled to understand | Start with no breadboard and one idea at a time |
| Aii | Add a "novice" option in onboarding | Add "Complete beginner / just curious" to "Who are you?" |

### Fixes these add

1. **The current step is always visible** (phone and desktop): a small step bar above the bench with the one-line instruction, a "Show me" button and the step count. The Lesson tab keeps the full text.
2. **"Show me" demo**: a ghost hand animates the step on the real bench (opens the parts list, drags the part to its place, draws the wire), then undoes it so the student does it themselves. No video files to record or translate; it works for every lesson and language.
3. **Examples build themselves**: choosing an example plays the build part by part (part flies out of the palette, wires draw in), with a "Skip" button, instead of the whole circuit appearing at once.
4. **Highlight what to touch**: the part to pick glows in the palette, and the target holes glow on the board.
5. **Onboarding**: "Complete beginner" as the first "Who are you?" choice; it starts Spark Quest.

## Idea

Add a short **game world before the Basics module**: 12 tiny puzzle levels, 30–90 seconds each, **one new idea per level**. No breadboard, no long text. You win stars, unlock the next level, and finish with the real bench unlocked.

### Rules for every level

1. **Show the goal, don't write it.** A goal card with a picture ("make this bulb glow"), at most one short line of text.
2. **Few parts.** The palette shows only the parts this level needs, as big chunky pieces; wires snap from terminal to terminal.
3. **The circuit is alive.** The real simulator runs all the time: current flows as moving dots, bulbs glow, motors spin, buzzers beep.
4. **Mistakes are fun, not failure.** A short-circuit sparks, an LED with no resistor pops with a puff of smoke, then resets in one tap. Each "fail" can unlock a hidden badge ("Smoke tester").
5. **Rewards.** 1–3 stars per level (solved · used the fewest parts · no hints), a sound and confetti, a level map that fills in.
6. **Hints in steps.** "Stuck?" reveals a nudge, then an arrow, then the answer, and costs only the "no hints" star.

### Levels (first draft)

| # | Level | Idea learned | Win condition |
|---|---|---|---|
| 1 | Close the loop | A circuit is a loop | Bulb glows |
| 2 | Light switch | A switch opens and closes the loop | Bulb turns on and off |
| 3 | Two bulbs, one battery | Series: bulbs share, both dimmer | Both glow |
| 4 | Make them bright | Parallel: each gets full power | Both glow bright |
| 5 | Which way? | An LED works only one way round | LED glows |
| 6 | Save the LED | A resistor limits current (first try pops it) | LED glows, not burnt |
| 7 | Doorbell | Push button + buzzer | Buzzer sounds when pressed |
| 8 | Fan | Motor; reverse the battery and it spins the other way | Motor spins |
| 9 | Brighter, dimmer | A knob (potentiometer) changes current | LED goes from dim to bright |
| 10 | Night lamp | A light sensor turns the lamp on in the dark | LED on when the "sun" slider is low |
| 11 | Meet the breadboard | The same LED circuit, now on a breadboard | LED glows |
| 12 | Boss level | Build a lamp with a switch and a resistor, free layout | All checks pass |

After level 12: badge "Spark Master", and "Your first circuit" and the rest of Basics open as normal.

### Progress and motivation

- **Level map** on the home page for new students (ties into A3, the learner home).
- **XP and badges** across the whole site later (lessons give XP too); **daily streak**, gentle, no punishment for missing a day.
- **Share card**: "I built a night lamp" image after the boss level.
- Everything works without an account; progress syncs if signed in (same as lessons).

## How it fits the code

- **Levels** are lessons with a new shape: `kind: 'level'`, an allowed parts list, a goal picture, a star rule. They reuse `Check` for win conditions, so the existing lesson-test runner can play every level in CI.
- **Puzzle board**: a simplified mode of the existing 2D canvas: palette limited to the level's parts, bigger hit targets, no menus, no 2D/3D switch, no code tab. Same engine and worker underneath.
- **New toy parts** where needed: bulb (incandescent), motor, buzzer, light sensor (LDR) with a "sun" slider. Check what `@eb/parts` already has first.
- **Feedback effects**: current-flow dots, spark and smoke animation, sounds (off by default under `prefers-reduced-motion` and with a mute button).
- **Onboarding**: for "New to electronics" and school students, the recommended path starts with Spark Quest instead of lesson 1.
- All text through `t()`.

## Build order

| # | Work |
|---|---|
| 0 | ✅ Quick fixes: step bar always visible, glow on what to touch, "Complete beginner" option, "Show me" ghost-hand demo |
| 1 | ✅ Puzzle board mode + level type + levels 1–3 (`/play`), test with the same students |
| 2 | Stars, level map and hints in steps ✅; sounds and spark/smoke effects still to do |
| 3 | Levels 4–12 and the new parts |
| 4 | XP, badges, streak, share card; connect to the learner home |
| 5 | Rewrite the start of Basics lesson 1 to be shorter now that Spark Quest teaches the ideas |

## Open questions

- Age and level of the students who tested: school (which class) or college?
- Mascot or no mascot (a small original character guiding the levels)?
- Sound on by default?

## Status (12 Nov 2026)

Built: `/play` level map and levels 1–3 (`apps/web/src/content/quest.ts`), puzzle mode of the bench (`Workbench tray` prop: only the level's parts, 2D, no menus), win check with a 1.5 s pause so the bulb is seen lighting, stars (★ solve · ★ no hints · ★ no Show me), friendly nudges for near misses (one wire only, switch beside the loop, bulbs in parallel), confetti, "Complete beginner" onboarding starts here, card on the home page.

Not yet: stars sync to the account (localStorage only), sounds, spark/smoke on a short circuit, levels 4–12.
