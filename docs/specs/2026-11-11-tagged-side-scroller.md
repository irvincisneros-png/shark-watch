# Tagged! Bondi → Kiama: side-scrolling migration mini-game

**Status:** first build of Shark Watch (owner asked for this before the stations, 2026-11-11). Sits alongside the main spec `2026-11-11-shark-watch-design.md`; the Fake or Fin? mini-game is still planned there.
**Play time:** 4–6 min. **Players:** Year 8, school Chromebooks/iPads/phones.

## Pitch
You're a juvenile white shark tagged by NSW DPI scientists. It's spring, and you're migrating south along the coast from **Bondi** to **Kiama**, past real SharkSmart listening stations. Eat, dodge and power up to stay alive. Swim through each station's range so you get *detected*, because every ping is a data point scientists use to work out where you went.

The data-science link is the ending, not a quiz bolted on: your run turns into a detection dataset, and you compare it with a **real white shark's pings** at the same stations.

## Route (real stations, IMOS installation 223736177)

| # | Station | Lat | Lon | IMOS stationId | Habitat for this leg | Landmark (above-water silhouette) |
|---|---|---|---|---|---|---|
| 1 | Bondi | -33.90 | 151.28 | 223736190 | sandy beach, surfers on surface (scenery only) | Bondi Icebergs pool |
| 2 | Cronulla | -34.05 | 151.16 | 336667162 | sand + low reef | Cronulla dunes / Kurnell headland |
| 3 | Stanwell Park | -34.24 | 151.00 | 336667150 | rocky reef, kelp (Ecklonia) | escarpment + Sea Cliff Bridge |
| 4 | Wollongong | -34.43 | 150.91 | 336667225 | harbour edge, shipping lane | Breakwater Lighthouse; Port Kembla stacks + ships at the leg's end |
| 5 | Shellharbour | -34.57 | 150.88 | 336667237 | Five Islands kelp, then reef | Five Islands; Bass Point |
| 6 | Kiama | -34.68 | 150.86 | 223736262 | reef finish | Kiama Lighthouse + Blowhole spout |

The progress strip shows real km between stations (great-circle from the coords) and a label: "Game simplification: distances and swim speeds are scaled."

## Core loop
- Side view, auto-scroll heading south (left → right). The player steers depth (up/down) and can **boost** (costs energy).
- **Energy** drains over time; eating prey refills it. Run out and you rest on the bottom, which means a retry from the last station (no harsh game over).
- **Keep moving (real biology):** white sharks are ram ventilators, so they need water flowing over the gills. If speed drops (e.g. tangled), an **oxygen** meter falls and recovers when you swim again. Fact card the first time it happens.
- **Listening station:** a surface buoy (VR4G style) with a mooring line and a soft glowing detection dome (real range about 500 m, scaled). Swim through the dome and you get **PING!**: a SharkSmart-style phone notification slides in, *"Tagged White Shark detected at Wollongong · 7:42 am"*, and a row is added to your data log. Missing a dome is allowed, but it leaves a gap in your data.

## Prey (juvenile white sharks mostly eat fish and rays)
- **Australian salmon** schools (main prey, mid-water).
- **Tailor** (fast, small bonus).
- **Stingrays** buried in sand: only visible with Electro-sense (big energy).
- **Never people.** Surfers and swimmers are surface scenery only. Bumping under them does nothing, and a once-only line says sharks don't hunt people.

## Power-ups (each one is real; a one-line fact card on first pickup)
1. **East Australian Current eddy:** a glowing current ribbon. Ride it for free speed. Fact: the EAC carries warm water down the NSW coast.
2. **Electro-sense (ampullae of Lorenzini):** for 8 s, reveals buried rays and hidden fishing line. Fact: sharks sense the tiny electric fields of living animals.
3. **Bait ball frenzy:** a swirling school; score multiplier while it lasts.
4. **Scent trail:** a faint plume points to the nearest prey for 10 s. Fact: sharks smell blood in very small amounts (keep the wording sourced, no exaggerated "one drop in an ocean" myth).
5. **Tag battery (data bonus):** a glowing tag icon doubles the next ping's data value. Fact: acoustic tags last years, but their batteries do run out.

## Hazards (real NSW threats to sharks; teach, don't preach)
- **Discarded fishing line + hooks:** tangles you (slow, oxygen falls) until you wiggle free (mash up/down or tap).
- **Plastic bags:** look like squid or jellyfish. Eating one costs energy. Fact card on marine debris.
- **Shark nets** off Sydney/Wollongong beaches (real NSW Shark Management Program nets): touching one = tangled + big energy loss. Fact: nets catch many non-target animals (turtles, rays, dolphins, harmless sharks). Keep it factual and neutral.
- **SMART drumline:** baited line with a buoy. Get "caught" and you get a short scene: hauled alongside, checked, released 1 km offshore. That costs time, but gives **+1 bonus data** (scientists check your tag). Fact: NSW uses SMART drumlines to catch, tag and release sharks.
- **Ship propeller wash** in the Port Kembla shipping lane (Wollongong leg): a big container ship passes overhead; its propeller zone pushes you down and damages you.

## Ending: "Your data" (the 8.1.3 payoff)
1. A map of the coast with your detections as dots, joined by straight lines. A table: time · station · ping #.
2. Caption: *"This is ALL the scientists see. Between pings they have to work out where you went."* Gaps (missed stations) are highlighted: "No data between Stanwell Park and Shellharbour."
3. **Real shark overlay:** the same view with a real white shark's detections from IMOS at these six stations (tag ID, dates), labelled "Real white shark, NSW DPI tag, [month year]". Students compare: "The real shark took 3 days. You took 4 minutes." "Which stations did it skip?"
4. Three reflection prompts, tied to the dot point: **Systems** (where would you add a station?), **Statistics** (one shark is enough to say all sharks do this? why not?), **Science** (what hypothesis could you test with 10 years of pings?).
5. Score: pings × multiplier + prey + energy left; 1–3 tags (stars). Local best score only. No accounts or names.

## Look (owner bar: polished, authored, real-looking; NO AI-generated sprites)
- three.js 2.5D: side camera with real 3D depth layers. Foreground kelp silhouettes, mid-ground play lane, background blue fog with distant reef.
- **Hero white shark (procedural, authored):** conical snout, black eye, five gill slits, tall triangular dorsal, long pectorals, crescent tail (near-symmetric lobes), caudal keel. Countershading (slate-grey top, sharp irregular line, white belly). Swimming wave in the vertex shader (body S-curve, tail leads); pitch follows steering; jaw opens on bite; the **tag** (small yellow-orange dart tag at the dorsal base) is visible.
- God rays, animated caustics on sand, marine snow particles, bubbles on boost, surface seen from below (Snell's-window brightening) with landmark silhouettes above it.
- Each leg's habitat changes palette and props (sand ripples → kelp reef → harbour murk + ship → Five Islands → Kiama reef).
- Reuse and adapt (copy, don't import across repos): `deepswell/src/life/fishModel.js` + `looks.js` (procedural fish, reef shark look), `deepswell/src/world/flora.js` (kelp), `particles.js`, `ocean/shaders.js`. Vendored three from `deepswell/vendor/three`.
- Quality tiers (low/medium/high, auto by fps) and a capped pixel ratio. Lessons from TideLine: no MSAA on composer targets; keep composer pixel ratio in sync on resize.

## Controls
- Keyboard: ↑/↓ or W/S steer · hold Space or Shift = boost · E = Electro-sense (when charged) · P/Esc = pause.
- Touch: drag anywhere on the left 60% to steer (shark follows finger depth) · BOOST and SENSE buttons on the right.
- Gamepad: left stick + A (boost) + X (sense), nice to have.

## Accessibility and classroom
- Reduced motion option (no screen shake), colour-blind-safe meters (shape + colour), captions for every fact card, mute toggle (audio: procedural WebAudio sonar ping, muffled underwater ambience, bite crunch).
- Must run offline once loaded; no live network calls (IMOS data baked into `data/`).
- Teacher note in README: 3 discussion questions linking to 8.1.3.

## Data credits (required)
Credits screen: "Data was sourced from Australia's Integrated Marine Observing System (IMOS) Animal Tracking Database (https://animaltracking.aodn.org.au). IMOS is enabled by the National Collaborative Research Infrastructure Strategy (NCRIS)." Plus the NSW DPI receiver project ("NSW DPI (Whaler, White and Tiger Shark Program)"), the tag project of the real shark used, and the access date.
