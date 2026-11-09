# Solar Bench: learning site plan

> Goal: learn to wire, run and break the whole solar setup on screen first, then repeat the same steps on real hardware.
> Source for hardware and numbers: `DIY_Solar_Project.md`.

## References

| Reference | What we took |
|---|---|
| robotics-engineer.vercel.app ("Robotics Bench") | Layout: left curriculum (Fig. 01, 02…), a figure with working buttons in the middle, live stats top right, and below it the selected part, serial monitor, "Check yourself" quiz and practice task |
| april-zhu.com/colorfigures | Style: hand-inked isometric figures, wobble slider, body-colour swatches (tomato, mustard, mint, cobalt, blush), clickable labels, self-contained HTML |

Robotics Bench is a single inline SVG with a monospace font on a cream background (`#f2efe7`). Solar Bench follows the same pattern.

## Tech

- One HTML file per figure: `index.html` (Fig. 01), `fig-02-panel.html` … `fig-10-inverter.html`. Plain HTML/CSS/JS with inline SVG. No build step, no dependencies.
- Shared files:
  - `bench.css`: the look, plus the global view toggles (`body.hide-labels .lbl`, `body.hide-off .off`).
  - `bench.js`: sidebar, the figure list `BENCH_FIGS`, and the "View" toggles (labels, disconnected wires), saved in `localStorage`.
  - `kit.js`: iso helpers, log, quiz, checklist, parts card, menus. Used from Fig. 03 onward.
  - `components/multimeter.js`: the floating, draggable multimeter used on every page.
  - `components/registry.js` + `components/*.js`: one file per physical part, shown in `components.html`.
- To add a figure: create the file, keep `<aside id="side" data-cur="NN">`, and add its `href` to `BENCH_FIGS`.
- Isometric projection: `P(x, y, z)` maps world units to the screen; `box()` draws three faces.
- Wobble: SVG `feTurbulence` + `feDisplacementMap`, controlled by a slider.
- Run: open `index.html`, or run `python3 -m http.server 8765` and open `http://localhost:8765`.

## Multimeter component (`components/multimeter.js`)

A Themisto TH-M100 style meter that floats over any page. Toggle it with the 🔧 button or the `M` key.

- **Drag:** the meter body moves anywhere. Probe tips snap to any element with `data-anchor`; dropped elsewhere they hang free.
- **Cables:** verlet rope physics (18 points), so they sag and swing.
- **Knob:** OFF / V / Ω / continuity / A, by click, step or scroll. FUNC toggles AC/DC and starts in AC on purpose. Sockets 10A / COM / VΩmA, HOLD, continuity beep.
- **Mistakes it models:** DC on the AC range reads ~0; reversed probes give a minus sign; red in 10A across a battery is a short (sparks, meter fuse blown); current through VΩmA blows the mA fuse; Ω on a live circuit reads Err.

**Page API:**

```js
// anchors: <circle data-anchor="bat-pos" data-node="b+" data-label="Battery +" …>
Multimeter.setModel({
  nets: () => ({ 'b+': { v: 12.6, g: 'bat', imax: 300 }, 'b-': { v: 0, g: 'bat', imax: 300 } }),
  resistance: (a, b) => 0.02,   // used when unpowered; Infinity = open
  onEvent: e => {},             // short, fuse-mA, ohm-live
});
Multimeter.on(e => {});         // reading, attach, detach, knob, socket, open, close, …
Multimeter.attach('red', 'bat-pos'); Multimeter.set({ knob: 'V', ac: false, socket: 'VmA' });
```

Nets in the same `g` group form one circuit, so the voltage between them can be measured. A net that isn't in the map reads as floating. `imax` is the source's current limit.

`multimeter.html` is the practice lab: battery, panel, good and blown fuse, 220Ω resistor, wire and a 230V socket, plus 10 drills.

## Fig. 01 Full setup

**Figure:** 55W panel on a stand, charge controller on a wall board (LCD, ☀/▮/💡 terminals, USB), Exide 26Ah battery, 10A fuse on battery +, 12V DC fan, DC-DC → router, and a phone on USB.

**Simulation (driven by time of day):**
- Sun = `sin` curve from 06:00 to 18:00 × weather (clear 1, cloudy 0.55, rain 0.2)
- PWM charging: `2.62A × sun`, tapering above 90%
- Loads: fan 0.85A, router 0.6A, phone 0.6A, controller 15 mA
- SoC from the voltage table: 12.7 / 12.4 / 12.2 / 11.9V = 100 / 75 / 50 / 25%
- LVD: 12.0V after settings (default ~10.7V), reconnect at 12.6V
- Wh in/out summary at the end of each day

**Failure modes it teaches:**
- Panel connected before the battery → controller detects 24V (`FAULT 24V`). Fix: disconnect everything and reconnect in order.
- Reversed polarity with the fuse in → fuse blows
- Red probe in the 10A socket across the battery → short circuit
- Battery removed while the panel is still connected → warning
- Voc measured while the panel is connected → reads battery voltage (PWM clamp)
- Settings skipped → battery drops below 50%

**Practice task:** the checklist from section 13 of `DIY_Solar_Project.md`, ticking itself as you go.

## Fig. 02 Solar panel

- Tilt (0–90°) and direction sliders. The sun's path comes from ~25°N latitude and the season (8 Nov, 21 Dec/Mar/Jun).
- Light on the panel = beam × cos(incidence) + diffuse, with a haze factor. Cell temp = air + G/800 × 25.
- Live I-V curve with 3 bypass-diode groups (column groups). Shade shows as a step, with PWM (13.2V) and MPPT points.
- Shade: a leaf on 1 cell costs ~1/3 of the power, the tank's shadow on the bottom row ~75%, cloth over one group ~1/3.
- Exploded view: glass → EVA → cells → EVA → backsheet → frame → junction box.
- "Find best tilt" scans 0–70° for daily energy.

## Fig. 03–10

Every figure follows the same pattern: figure + action buttons + "Try a mistake" + stats + selected part + log + quiz + practice task + floating multimeter anchors.

| Fig | File | Topic |
|---|---|---|
| 03 | `fig-03-controller.html` | PWM switching, charge stages, 12/24V detect, LVD, LOAD− switching |
| 04 | `fig-04-battery.html` | Cutaway cells, voltage → SoC, DoD vs cycle life, Ah budget |
| 05 | `fig-05-multimeter.html` | Knob/sockets, right reading vs wrong setup, the 10A socket short |
| 06 | `fig-06-wiring.html` | Wire size vs voltage drop and heat, ring lug, ferrule, fuse, MC4 |
| 07 | `fig-07-dcdc-router.html` | Buck-boost, setting the output, barrel polarity, IN− on LOAD− |
| 08 | `fig-08-monitor.html` | INA226 shunt math, I2C wiring, live dashboard, ESP32 sketch |
| 09 | `fig-09-second-panel.html` | Parallel vs series, controller limits, mismatch, bigger battery |
| 10 | `fig-10-inverter.html` | AC loads vs runtime, idle draw, fuse/wire, pure vs modified sine |

## Component gallery (`components.html`)

Each physical part lives in its own file in `components/` and registers with `BenchParts` (`components/registry.js`). A part provides its drawing, multimeter anchors, nets, resistance, controls and specs. The gallery shows one part at a time, or all of them, and every part can be measured with the floating meter.

## Build board (`board.html`)

A free-build sandbox. Parts from the left palette (every `components/` part) are dragged onto an isometric board, and you wire them terminal to terminal. The circuit really runs.

- **Solver (`components/circuit.js`):** nodal analysis with Newton iteration. Elements are resistors, current sources and non-linear parts (panel I-V curve, bypass and protection diodes, fan).
- **Part models (in `board.html`, object `M`):**
  - Panel: I-V curve from sun and time of day.
  - Battery: OCV table + 0.03Ω internal resistance; charge integrates over time.
  - Fuse: blows at 2× its rating, or after ~2 min above 1.1×.
  - Controller: common-positive, negative-switched; 12/24V detect at power-up, charge/absorb, LVD/reconnect, USB 5V, reverse-battery diode.
  - DC-DC: constant-power input, fixed output, buck dropout.
  - Router: rated voltage, overvoltage death, reverse-polarity block.
  - Phone, inverter (low-voltage cutoff, 300W overload), ESP32, INA226 shunt, MC4 (bad crimp).
  - Wires: ~0.012Ω; they burn above ~30A sustained or ~120A at once.
- **Multimeter:** reads the solved node voltages. With the red plug in 10A, the meter is added to the netlist as a 0.03Ω path, so series current readings and shorts are real.
- **Saving:** the layout is saved in `localStorage` (`bench.board.v1`). "Load example" builds the Fig. 01 setup.

## Open decisions

- The figure pages still draw their own parts. Moving them onto the shared `components/` parts would make every figure consistent, but it means refactoring all 10 pages.
- Fig. 08's simulated data can later be replaced by real ESP32 MQTT/serial data, so that page becomes the monitoring app.
- Once the real parts or manuals arrive, check the numbers on the labels: the controller's max PV input and the router adapter's V/A.
