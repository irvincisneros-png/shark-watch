# Shark Watch — design spec

**Status:** design only, not built. Fable 5.2 to orchestrate the build.
**Date:** 2026-11-11
**Audience:** Year 8 Science, NSW (Woonona High School, Illawarra)
**Syllabus dot point:** 8.1.3 Recognise that data science is an interdisciplinary field that uses statistics, scientific methods and processes, algorithms and systems to develop knowledge by extracting or extrapolating insights from data.

## Why this exists

The faculty lesson (PPT 8.4.1.3, slide 9 shark movement + worksheet 8.4.1.3a) has students *look at* a finished data-science product. Shark Watch makes students *do* each of the four disciplines, and shows that dropping any one of them breaks the conclusion.

## Lesson shape (~60 min)

1. **Warm-up, unplugged (10 min):** "classroom ocean". 3 students walk secret routes as sharks; 6 are receivers logging a timestamp when a shark passes within arm's reach. Class rebuilds routes from the logs. Missed pings and clock errors happen naturally.
2. **Hook (3 min):** SharkSmart. NSW DPI's real-time tagged-shark listening stations, Tweed Heads → Merimbula. Four are on our coast: **Stanwell Park, Wollongong, Shellharbour, Kiama.**
3. **Shark Watch sim (35 min):** four stations + mini-game + finale (below).
4. **Exit ticket (5 min):** contrast with Palm Oracle. "Palm Oracle collected data too. Which of the four disciplines was missing?"

## Real data: verified 2026-11-11

The SharkSmart listening network **is in the IMOS Animal Tracking Database**, openly queryable with no login.

- Portal: https://animaltracking.aodn.org.au
- Installation: `NSW DPIRD (Tagged shark listening stations)`, id `223736177`, 39 stations, receiver project "NSW DPI (Whaler, White and Tiger Shark Program)". Many stations deployed since 2015–2016, so roughly 10 years of seasons.
- Station coordinates: `GET /api/station/stations.csv` (filter `installation_name`).
- Detections: `GET /api/detection?installationId=223736177&size=50&page=N`. **Max page size is 50.** Bulk: `/api/detection/detections.zip?<filters>&token=` (token from `/api/detection/downloadToken`, came back null anonymously, so try without one).
- Sample of 400 recent detections (25 Sep – 12 Oct 2026): Greynurse 264, Bull 79, **White 35**, Port Jackson 16, Kingfish 6. Every tag project in the sample had `protected: false`.
- Detections lag the present by about a month (latest receiver recovery 2026-10-13).
- Each row has a timestamp, station name, transmitter ID, species, tag project.

**Build rule:** a one-off script fetches a fixed slice (e.g. 2016–2025 detections for the 39 stations, aggregated to daily counts per station per species, plus raw rows for a handful of white and bull shark tags) and commits it as static JSON. The sim never calls the API live, because school networks can't be relied on.

**Attribution (required by the IMOS data policy):** credits screen with the IMOS acknowledgement, the citation `IMOS [year]. Animal Tracking Database. https://animaltracking.aodn.org.au. Accessed: [date].`, plus the NSW DPI project and each tag project used. The policy asks users to contact data owners before *publications*. A classroom tool isn't a publication, but list it as an open question for the owner.

**Testable real claim:** a NSW Shark Management Program report found white shark detections at Port Stephens rise June → November. Students test it with 10 years of data, and can check whether it also holds for the Illawarra stations.

## The four stations

| Station | Student does | "Break it": what goes wrong when it's skipped |
|---|---|---|
| **Systems** | Places 6 receivers along the Illawarra on a budget; picks real-time (SharkSmart-style) vs seabed receivers that need retrieving | Coverage gaps: the shark "vanishes" and the student invents where it went |
| **Algorithms** | The **Fake or Fin?** mini-game (below) | Junk pings make a fake track |
| **Statistics** | One tagged white shark vs all white sharks: monthly counts, average, spread | "One shark went north, so all sharks go north" gets flagged as overclaiming |
| **Scientific method** | Writes a hypothesis from the Port Stephens claim, tests it on the 10-year data, decides whether it holds locally | Correlation trap: a deliberately offered "ice-cream sales" overlay |

**Finale, the Beach Call:** with the cleaned data, students decide whether to raise a shark alert for Wollongong for a given week in a chosen month, and justify it using all four stations. Then the **break-it replay:** switch off one discipline at a time and watch the same decision go wrong. Ends on a diagram of the four disciplines feeding one insight; this diagram is the dot point.

## Mini-game: Fake or Fin? (Algorithms station, ~8 min)

**Pitch:** you're the data-cleaning crew for the NSW shark network. Pings pour in from the real listening stations. Some are fakes. Catch them before they mess up the map, then build a bot that does it for you.

### Round 1: Human filter (60–90 s, arcade)
- A stylised top-down NSW coast map with the real station positions. A shark's track (a real tag's detections) builds up ping by ping; each ping pops as a sonar ring.
- Each incoming ping is a card: **shark ID · species · station · time**. The student swipes or taps **FIN (real)** or **FAKE**, with ← / → on keyboard.
- Fake types are injected into otherwise real tracks, and the game says so up front ("we've hidden fakes in real data"):
  1. **Teleport:** detected too far away too soon (e.g. Kiama, then Byron Bay 10 minutes later).
  2. **Echo:** an exact duplicate, same receiver, same second.
  3. **Ghost receiver:** a station that wasn't deployed on that date (use real deployment dates).
  4. **Mystery tag:** a transmitter ID that isn't registered. IMOS has a real "mystery tags" tool, worth a one-line fact card.
- Speed ramps up. Streaks and combos, sonar ping sound, a "map corrupted" glitch effect when a fake gets through.
- A backlog bar fills faster than anyone can clear it. End card: *"You checked 41 pings. NSW stations logged [real number] last year."*

### Round 2: Build the bot (3–4 min)
- The student builds rules from blocks:
  `IF distance ÷ time > [slider] km/h → reject` · `IF same receiver + same second → reject` · `IF station not deployed → reject` · `IF tag not registered → reject`.
- Press **RUN**: the bot clears the full real year instantly. That's the "why algorithms" moment.
- **Tradeoff reveal:** set the speed slider too strict and the bot throws away real pings, so a real shark's fast trip disappears. Set it too loose and teleports get through. The student needs a fact about **how fast sharks actually swim** to set it. That's the interdisciplinary punchline: an algorithm needs biology (science) and an error count (statistics) to be any good. Fable: source a real, cited cruising/burst speed for white and bull sharks before setting the tuning range.

### Round 3 (optional): Speedrun
- A new set of mixed pings: student vs their bot vs the class best (local high score only, no accounts, no names stored).

### Feel and art
- Follow the owner's preferences: authored visuals, **no AI-generated sprite art**, polished rather than primitive. A low-poly authored 3D shark (three.js, TideLine-style procedural or hand-built model) swims in a corner panel that mirrors the current track. Map is clean SVG or canvas.
- Touch-first (school iPads and Chromebooks), plus keyboard. Must run offline once loaded.

## Open questions for the owner
- Should the IMOS / NSW DPI data owners be contacted before the site goes public?
- Single-period lesson (as above) or split across two?
