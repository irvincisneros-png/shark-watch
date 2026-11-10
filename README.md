# Tagged! Bondi to Kiama

A side-scrolling migration mini-game for **Year 8 Science (NSW), syllabus point 8.1.3** (data science). You are a young white
shark with an acoustic tag. Swim south past six real SharkSmart listening stations, eat, dodge and power up, and get *detected*.
At the end your run becomes a detection dataset, which you compare with a **real white shark's pings** from the IMOS Animal
Tracking Database. Play time 4 to 6 minutes. Works offline once loaded; no live network calls.

Design: `docs/specs/2026-11-11-tagged-side-scroller.md` (and the wider Shark Watch spec beside it).

## Run it

```
cd shark-watch
python3 -m http.server 8480        # or: python3 devserver.py 8480  (threaded, no-cache; nicer for dev)
open http://localhost:8480/
```

No build step: vanilla ES modules, three.js vendored in `vendor/three` and loaded through an import map.

URL options: `?q=low|medium|high` (quality tier), `?autoplay=1` (autopilot demo), `&miss=3` (autopilot skips station index 3),
`?touch=1` to force touch controls.

## Controls

| | Keyboard | Touch | Gamepad |
|---|---|---|---|
| Steer depth | Up/Down or W/S | drag on the left 60% (shark follows your finger) | left stick |
| Boost (costs energy) | hold Space or Shift | BOOST button | A |
| Electro-sense (when charged) | E | SENSE button | X |
| Pause | P or Esc | pause button | - |
| Dismiss a fact card / skip intro | Space or Enter, or click | tap | - |

Settings: mute button, reduced-motion option (no screen shake) on the title and pause screens. Fact cards are captioned text.

## How it plays

- Energy drains over time; eat Australian salmon and tailor to refill. Empty energy means a rest on the seabed, then a retry from the last station.
- **Keep moving**: white sharks are ram ventilators. If you slow down or get tangled, oxygen falls.
- Swim through a station's glowing dome for a **PING**: a SharkSmart-style notification and a row in your data log. Miss a dome and there is a gap.
- Power-ups: East Australian Current, Electro-sense, bait ball frenzy, scent trail, tag battery (doubles the next ping).
- Hazards: fishing line, plastic bags, shark nets, SMART drumline (a short catch-tag-release scene, +1 bonus data), ship propeller wash.
- Sharks never hunt people: surfers are scenery only.
- "Game simplification: distances and swim speeds are scaled." is shown in the progress strip, with the real km between stations.

## Teacher note: discussion questions for 8.1.3

1. Your run produced a dataset of pings. What does a ping tell scientists, and what does it **not** tell them?
2. The real shark was never detected at Wollongong, Shellharbour or Kiama in this window. Does that mean it was not near them? How could a data scientist decide?
3. Which parts of this activity were statistics, algorithms/systems, the scientific method, and interdisciplinary knowledge (biology, geography, technology)? What would break if one were missing?

The ending also asks three reflection prompts (Systems: where to add a station; Statistics: why one shark is not enough; Science: a hypothesis for 10 years of pings).

### About the real shark

`data/real-track.json` holds one real **White Shark** (transmitter A69-9001-61077, tag project "NSW DPI Shark Meshing Program"),
detected at 3 of the 6 stations within 27 days: Cronulla (18 Jun 2025 UTC), Stanwell Park (22 Jun), then Bondi (11 and 15 Jul).
Detections are unedited; detections less than 2 hours apart at one station are grouped into a "visit". The shark was **not** seen
moving south the whole way (it was next detected back at Bondi), and the screen says so. I could not find a white shark detected at
four or more of these stations in a short window within a reasonable number of polite API requests.
Regenerate with `npm run data` (needs network; Node 18+).

## Data credits

Data was sourced from Australia's Integrated Marine Observing System (IMOS) Animal Tracking Database
(https://animaltracking.aodn.org.au). IMOS is enabled by the National Collaborative Research Infrastructure Strategy (NCRIS).
Receiver network: NSW DPI (Whaler, White and Tiger Shark Program), installation "NSW DPIRD (Tagged shark listening stations)".
Citation: IMOS 2026. Animal Tracking Database. https://animaltracking.aodn.org.au. Accessed: 11 November 2026.
The IMOS policy asks users to contact data owners before *publications*; this is a classroom tool, but check before making it public.

## Layout

```
index.html, styles.css          page, HUD, screens
src/main.js                     boot, game loop, render passes, wiring
src/logic/                      pure, tested: route, geo (km), sim, level, dome, datalog, vitals, score, fsm, content, bot
src/render/                     shark.js (hero), terrain, env (water, sky band), objects, prey, particles, boat, palettes
src/art/                        fish builder + looks + kelp copied from ../deepswell and adapted
src/audio/                      WebAudio engine (from DeepSwell) + procedural sounds
src/ui/                         hud, input (keyboard/touch/gamepad), ending, endmap, icons
src/data/baked.js               generated from data/*.json (tools/build-data-module.mjs)
data/                           stations.json, real-track.json (baked IMOS data)
tools/fetch-imos.mjs            the one-off IMOS fetch
tests/*.test.mjs                node:test logic tests (npm test)
tests/playtest/                 Playwright: shots.mjs (screenshots), flow.mjs (real-input flow)
```

## Tests

`npm test` runs the pure-logic tests (state machine, vitals, pickups and collisions, domes, data log, scoring, km between stations,
level layout, and full autopilot runs). `node tests/playtest/shots.mjs` needs the dev server on :8480 and borrows Playwright from
`../LifeLens/node_modules` (override with `PLAYWRIGHT_PATH`); it writes screenshots to `playtest-shots/` (desktop 1280x720 at DPR 2,
mobile 844x390). `node tests/playtest/flow.mjs` drives the game with real keyboard input.

## Look and performance notes

All visuals are authored real-time 3D and shaders in three.js; no AI-generated images. Quality tiers (low/medium/high) are chosen from
device hints, and the pixel ratio is capped and lowered automatically if the frame rate drops. There is no post-processing
composer (and so no MSAA on any render target); the vignette is CSS. Instanced kelp, rocks and fish; terrain and props are
chunked and only nearby chunks draw. The swim wave is drawn mostly in the screen plane so it reads from the side camera.
