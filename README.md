# Tower Defense: Action Hero

A three.js MVP that blends tower defense with direct character action: enemies march
along a path toward your base, and you both build towers AND run around as a hero
melee-attacking them yourself.

## Run

```bash
npm install
npm run dev
```

## Controls

- **WASD / arrows** — move
- **Space** — melee attack (18 dmg, short frontal arc)
- **Click a grey pad** — open the tower shop (Arrow 50g, Cannon 80g AoE, Frost 60g slow)
- **Start Wave** — begin the next of 5 waves; survive all to win

## Drop in your own character

Export your rigged character as GLB and save it to `public/character.glb`.
It is loaded automatically and scaled to ~2 units tall. Animation clips whose names
fuzzy-match `idle`, `run|walk`, and `attack|punch|swing|slash` are wired to the
AnimationMixer; without them you get procedural bob/swing. No GLB → placeholder robot.

## Architecture

- `src/core/events.ts` — typed event bus (TOWER_PLACED, WAVE_START, ENEMY_KILLED,
  PLAYER_ATTACK, GAME_OVER, …). **This is the hook point for the planned ElevenLabs
  "teacher" agent** — subscribe to events and generate commentary.
- `src/core/state.ts` — gold / lives / wave / phase
- `src/world/arena.ts` — ground, path, base, tower plots, décor
- `src/entities/` — enemy, spawner (wave definitions), tower, projectile
- `src/player/` — character visuals/animation + WASD controller & chase camera
- `src/ui/hud.ts` — stats, shop, messages, win/lose overlay
- `src/audio/sfx.ts` — Web Audio one-shot effects, no asset files

A `window.__game` debug handle exposes state, spawner, towers, player, events and
buildTower for testing (and future agent integration experiments).

Design informed by [GameBlocks](https://github.com/xt4d/GameBlocks) module patterns
(waypoint progress, wave director, health bar view), reimplemented compactly without
the Rapier physics dependency.
