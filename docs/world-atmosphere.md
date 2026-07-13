# World Atmosphere

## What It Does

The atmosphere system separates celestial sky state from world-space weather. Sun, moon, stars, and sky colors can remain effectively infinite, but clouds, weather cells, fog, and particles are sampled from world coordinates, biome context, seed, and time. The player should move through weather zones rather than dragging weather as a camera overlay.

## Main Files

- `src/environment/Atmosphere.ts` is the runtime facade used by the game loop and renderers.
- `src/environment/WorldAtmosphere.ts` builds world-position-based atmosphere snapshots.
- `src/environment/WeatherCells.ts` provides deterministic biome-linked weather cells and soft blended cell influence.
- `src/environment/CloudLayer.ts` samples clouds from world coordinates and wind/time.
- `src/environment/WorldWeatherParticles.ts` produces world-space rain/snow/sand particles near the player.
- `src/render/AtmosphereRenderData.ts` defines renderer-facing atmosphere data.
- `src/render/WebGpuRenderer.ts` and `src/render/WebGlRenderer.ts` consume the same snapshot/fallback data.
- `src/game/GameLoop.ts` updates atmosphere per frame, samples biome at world position, updates world weather particles, and forwards snapshots.
- `src/ui/DebugOverlay.ts` displays current weather, wind, cloud offset, cell id, and particle counts.

## Data Flow

1. `GameSessionFactory` creates `Atmosphere` with world seed, game time, weather settings, and debug controls.
2. `GameLoop` samples atmosphere from player/camera world position, local biome, and current game time.
3. `Atmosphere` delegates world-space sampling to `WorldAtmosphere`, `WeatherCells`, `CloudLayer`, and `WorldWeatherParticles`.
4. The renderer receives an atmosphere snapshot containing sky colors, fog, cloud data, and particle data.
5. Renderers subtract camera position during view/projection. Particle generation itself stores world positions.
6. Debug overlay reads snapshot fields to prove weather is world-position based.

## What Not To Do

- Do not reintroduce DOM or canvas weather overlays that are purely camera/screen-space.
- Do not generate rain/snow/sand particles in camera-local coordinates.
- Do not make clouds scroll with camera movement; clouds should drift by wind/time and sample world coordinates.
- Do not remove the WebGPU/WebGL fallback path.
- Do not remove day/night cycle behavior when adjusting weather.
- Do not use nondeterministic random weather for systems that need save/load stability.

## Adding Content Safely

- Add biome-linked weather weights in `Biomes.ts` or weather-cell logic, then test deterministic sampling and adjacent-cell blending.
- Add particle types through `WorldWeatherParticles.ts` and `AtmosphereRenderData.ts` before renderer implementation.
- Keep generated particle counts bounded around the player for performance.
- Ensure renderers accept safe defaults when weather is clear or snapshots omit optional data.
- When adding debug fields, update `DebugOverlay` tests.

## Tests That Protect It

- `src/environment/Atmosphere.test.ts` covers day/night and atmosphere facade behavior.
- `src/environment/WorldAtmosphere.test.ts` covers weather cells, clouds, world-position sampling, and particle generation.
- `src/environment/WeatherCells.ts` behavior is covered through atmosphere/weather tests.
- `src/render/AtmosphereRenderData.test.ts` covers renderer-safe snapshot defaults.
- `src/ui/DebugOverlay.test.ts` covers debug overlay weather/performance rows.
