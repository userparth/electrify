# Electronics Bench

Interactive electronics workbench for schools and colleges. Plan: `docs/PLATFORM_PLAN.md`.

```bash
pnpm install     # also fetches MicroPython + copies Pyodide (scripts/fetch-assets.mjs)
pnpm test        # engine + parts tests
pnpm typecheck
pnpm dev         # http://localhost:3000 — home, /workbench, /solar
```

Arduino compiling needs `arduino-cli` with the AVR core on the machine running the app:
`brew install arduino-cli && arduino-cli core install arduino:avr` (set `ARDUINO_CLI` if it isn't on PATH).

- `packages/engine`: circuit simulator (MNA, Newton–Raphson, backward-Euler transient, 74xx/555 digital parts, bench instruments)
- `apps/web`: Next.js 16 app (workbench, compile API)
- `apps/web/public/solar`: the original solar prototype (plain HTML), served at `/solar` until it is rebuilt as lessons
- `packages/parts`: every part, instrument and board (Arduino Uno, Raspberry Pi 4)

## License

Copyright (C) 2026 Parth Sharma.

Electronics Bench is free software: you can redistribute it and/or modify it under the terms of the
**GNU Affero General Public License v3.0 or later** (see [`LICENSE`](LICENSE)). If you run a modified
version as a network service, you must offer its source code to its users.

Third-party pieces keep their own licences: avr8js and rp2040js (MIT), Pyodide (MPL-2.0),
MicroPython (MIT) and the RP2040 bootrom (BSD-3-Clause, Raspberry Pi) are fetched by
`scripts/fetch-assets.mjs` and not stored in this repository; `arduino-cli` (GPL-3.0) and the Arduino
AVR core (LGPL) are installed on the machine that compiles sketches.
