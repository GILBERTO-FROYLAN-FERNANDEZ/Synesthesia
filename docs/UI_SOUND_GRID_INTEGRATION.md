# UI + Sound Grid integration

Proposed branch: `feature/ui-sound-grid-integration`. Base: the supplied `feature/redesigned-ui-integration` ZIP. Sound implementation: the supplied `sound-grid` ZIP. No new package dependencies.

## What changed

- The redesigned Solo Performance workspace defaults to the teammate's polyphonic SoundGridEngine. Enable sound is a deliberate user gesture; camera and visual response start independently of audio autoplay.
- The actual mirrored tracker frame feeds the grid and the current visual engine. The existing camera preview is reused rather than opening another camera. Grid display and audio enablement are independent. Each grid cell shows its own note and motion activity.
- Sound controls are grouped by movement mapping, sound character and response/level. All original grid sizes (2×2, 3×3, 4×3, 4×4), play modes, tones, scales, root notes and response/volume settings remain available. Master mute/volume are separate from grid volume.
- Solo can select Material mode in the Sound inspector. The earlier Collaborative prototype is retained in source but is not mounted by any public route. The Studio material editor is unchanged.
- The grid can run on its original standalone AudioContext (mouse harness) or use the live workspace AudioContext. The latter mixes into the existing generated recording bus as well as the speakers, without applying the legacy single-region stillness gate to the grid. The context remains owned by the live runtime. Only one live sound source is audible at once.
- The grid is a live instrument, not an offline deterministic Studio material. The Session Review indicates that the generated recording is the way to preserve grid sound. Editable saved compositions still use ordinary sound materials. Grid settings are not yet persisted as a replayable grid instrument.

## Run locally

Node >=22.12; from the project root:

```sh
npm ci
npm run typecheck
npm test
npm run dev -- --port 5175
```

Open the URL printed by Vite. Start Solo Performance, enable camera, start performance, click Enable sound, move, then open Sound settings. Try each play mode, different tones/scales, all grid sizes and simultaneous movement in distant zones. Try mute, hide grid while sound remains on, camera off visually while tracking remains active, and switch back to Material. Record a short generated video and listen to it in Session Review. Also check that Collaborative only displays a concept preview and that the independent `/dev/sound-grid/` mouse harness still works. Stop Solo and verify audio and camera stop.

Automated checks: `npm run test:e2e -- tests/e2e/ui-sound-grid-integration.spec.ts tests/e2e/sound-grid.spec.ts tests/e2e/body-tracking.spec.ts tests/e2e/collaborative-live.spec.ts tests/e2e/perform-integration.spec.ts`.

## Verification status

Source syntax parsed using locally available TypeScript 5.8.3; 26 original Sound Grid unit cases passed in an independent Node assertion runner using transpiled source. This is not a Vitest or browser run. The sandbox could not resolve the npm registry (`EAI_AGAIN`); full project typecheck, build, and browser/audio/recording testing remain to be run locally with the pinned dependencies. The new integration browser tests are included but not yet executed. Do not merge into either existing branch until those checks and a manual audio/recording test pass.

## V3 demo scope

Solo uses the existing full-frame camera motion tracker (block-matching optical flow); the optional human segmentation model is not started and its toggle is not exposed in the demo UI. Existing composition fields and prototype code remain intact for future development. All six registered creative visual materials and compatible Push, Trail and Ripple mappings are unchanged. Collaborate navigation opens only a clearly marked, non-interactive concept illustration, including direct composition URLs; it does not start a camera, audio or a recording.
