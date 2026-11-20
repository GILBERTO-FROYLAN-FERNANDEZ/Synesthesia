# Sound grid (live audio mapping)

The sound grid cuts the live camera frame into zones (2 × 2 up to 4 × 4). Each zone has its
own note and its own place in the stereo field. Moving in a zone plays its note:

- **Hold:** the zone's tone swells while you move in it and rings down when you stop.
  Moving harder brightens it, and moving up or down bends its pitch a little.
- **Strike:** the zone plays a struck note when movement starts in it, or when movement
  suddenly surges.
- **Both:** both at once. Holds sit lower so the strikes stand out.

Pitch rises from the bottom-left zone to the top-right one, walking up a scale (pentatonic,
major, minor or whole tone) from a chosen lowest note. Low notes sit near the floor and high
notes above the head. Left and right are mirrored by default to match the mirrored camera
preview.

Where to find it: **Prepare → Start Live Motion**, then the **Sound grid** section at the
bottom of the panel. With no camera, try `dev/sound-grid/`, which plays the grid with the
mouse.

## How it fits

```
camera ─► tracker (live.worker / liveBodyTracking.worker) ─► SignatureFrame
                                                            │
                         ┌──────────────────────────────────┴───────────────┐
                         ▼                                                  ▼
             createLiveSampler → StudioRuntime                 SoundGridEngine.update(frame)
             (visual + sound material)                         zones → activity → voices
```

The grid only reads `SignatureFrame` (`cols`, `rows`, `field`). Both trackers produce it:

- Katie's optical-flow tracker on `main` (`src/signature/live.ts`).
- Gilberto's body tracker (`body-tracking-live`). It masks out everything but the body
  before the optical flow, so only body movement plays the grid. There is nothing extra to
  wire: call `grid.engine.update(frame)` in its `onMotion` callback, the same way
  `LiveStudioScreen` does.

| File | What |
|---|---|
| `src/live/soundGrid/layout.ts` | Grid sizes, scales, the note and stereo place of each zone (pure) |
| `src/live/soundGrid/zones.ts` | `SignatureFrame` or body landmarks → speed per zone (pure) |
| `src/live/soundGrid/activity.ts` | Envelopes, gates and strikes per zone (pure, timed by `dt`) |
| `src/live/soundGrid/voices.ts` | Tone table and Web Audio voices (hold and strike) |
| `src/live/soundGrid/SoundGridEngine.ts` | Puts it together: AudioContext, reverb, master chain |
| `src/screens/Studio/SoundGrid/` | `useSoundGrid` hook, `SoundGridCamera` overlay, `SoundGridPanel` |
| `dev/sound-grid/` | Harness: play it with the mouse; `window.spSoundGrid` for tests |
| `tests/unit/sound-grid.test.ts`, `tests/e2e/sound-grid.spec.ts` | Tests |

### Adding it to another live screen

```tsx
const grid = useSoundGrid();
// in the tracker's onMotion callback:
grid.engine.update(frame);
// on the stage, next to the camera <video ref={videoRef}>:
{grid.shown ? <SoundGridCamera engine={grid.engine} source={videoRef} mirror={grid.settings.mirror} /> : null}
// in the panel:
<SoundGridPanel grid={grid} />
```

### Using body landmarks instead of the flow field

For "a hand in a zone plays it" with no background motion at all, feed landmarks instead of
frames. The body-tracking worker already gets them from `poseLandmarker.detectForVideo`. It
would post them alongside the frame, for example
`{ points: POSE_PLAYING_POINTS.map((i) => res.landmarks[0][i]) }` (wrists, index fingertips,
ankles). On the main thread:

```ts
grid.engine.updatePoints(points, video.videoWidth / video.videoHeight);
```

`measurePointZones` turns each point's speed into the same units as the field (field
diagonals per second), so everything downstream is shared.

## Decisions (to copy into `docs/DECISIONS.md` on merge)

**2026-11-19: A live sound grid, separate from the sound materials.**
- **Decision:** The grid is its own small Web Audio instrument (`src/live/soundGrid`). It is
  not a sound material, and it is not a set of material instances swapped per zone.
- **Why:**
  - Latency: materials schedule about 350 ms ahead so the preview and the offline render
    write the same automation (SPEC 9.1). That is too late to feel like playing. The grid
    writes to "now" on the audio clock, about 25 ms from movement to sound plus the
    tracker's own delay.
  - Polyphony: every zone sounds at once. Running 9 to 16 material engines with worklets
    would not fit a 2017 MacBook Pro.
  - The grid isn't part of a composition or a render, so it sits outside the deterministic
    folders. It still reads no wall clock in its pure code: `activity.ts` takes `dt`.
- **Alternatives:**
  - Xiaoyu's Collaborative prototype (`feature/redesigned-ui-integration`) picks the single
    strongest third of the frame and swaps the one sound material. It is simple, but only
    one region sounds at a time, and the 350 ms lookahead plus the swap crossfade makes it
    lag. Its 3 × 3 per-region material assignments could sit on top of this engine later.
  - Tone.js: it would need the maintainer's approval as a new dependency, and plain Web
    Audio covers what the grid needs. No dependencies were added.
- **Details:**
  - Zone level is the RMS of cell speed, so a hand filling a fifth of a zone isn't diluted
    by the still cells around it.
  - Gate thresholds: open at 0.15, close at 0.06 of full scale. A strike can't come sooner
    than 0.18 s after the zone's last strike.
  - Response sets full scale from 0.8 down to 0.08 field diagonals per second (log).
  - At most 24 strikes ring at once. New ones are skipped rather than cutting old ones off.
- **Watch on the Mac:** CPU with 16 zones and Reed (sawtooth holds) on integrated
  graphics; whether the 0.15 open threshold is right for the built-in FaceTime camera's
  noise.

## Known gap, not part of this change

The live visual is not mirrored, but the camera preview is (`transform: scaleX(-1)`). A
movement on the left of the preview shows on the right of the visual. The grid follows the
preview.
