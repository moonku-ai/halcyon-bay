# halcyon-bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/moonku-ai/halcyon-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/moonku-ai/halcyon-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Halcyon Bay** — an open-world crime story in the spirit of GTA 6, built from scratch in three.js. You are Mara Voss, an ex-getaway driver back in Halcyon Bay: a sun-soaked 7×7-block city with five districts, a marina and a bay, living traffic, pedestrians, a five-star wanted system with police cruisers and a helicopter, five story missions, combat, and a full HUD with a live minimap. Steal any car, outrun the HBPD, rob the Meridian Bank, and finish the job at the docks.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no network requests — every file is local.

## How to play

- **W A S D** — move / drive · **Mouse** — look & aim (click to shoot) · **E** — enter / steal a car
- **Shift** — sprint · **Space** — handbrake · **Esc / P** — pause · **M** — mute · **H** — help
- Follow the yellow beacon: 5 story missions, $800 to $25,000 a job. Green briefcases hidden around the city pay $250 each. Progress saves automatically.

## What is inside

- `game/index.html` — the page, HUD and menus
- `game/src/city.js` — the city: districts, canvas-painted streets, facades, day/night
- `game/src/vehicles.js` — traffic AI, police chases, the helicopter
- `game/src/pedestrians.js` — sidewalk life that flees gunfire
- `game/src/player.js` — on-foot movement, arcade driving, camera
- `game/src/combat.js` — hitscan shooting, particles, explosions
- `game/src/missions.js` — five story missions with briefings and rewards
- `game/src/hud.js` — HUD, minimap, screens
- `game/src/audio.js` — procedural WebAudio: engine, sirens, gunfire, music
- `game/src/shots.js` — staged screenshot scenes (`?shot=title|drive|chase|mission`)
- `game/vendor/three.module.min.js` — three.js r160, vendored

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
