# Lines mapping

Choose **Lines** in the Mapping control, then choose Water, Honey, Smoke, or Bubbles. Lines is a mapping, not an additional medium. The Signature diagnostic view continues to show the captured motion directly.

The mapping selects a sparse, seeded sample of moving locations and follows each briefly. These paths determine where material is drawn or pushed. The medium determines what happens afterward:

- Water uses the fluid solver: sampled streams spread, swirl, and mix, with surface light and refraction only where water is present.
- Honey uses its viscous fluid solver: sampled paths deposit smooth amber fluid with surface highlights. The fluid spreads slowly and settles downward rather than remaining a fixed stroke.
- Smoke leaves broad, soft trails that rise, curl, broaden, and dissipate gradually. Weak capture motion and brief twitches are suppressed before new trails are drawn. At baseline they remain for six seconds; curling evolves more slowly than the fade.
- Bubbles are emitted at irregular intervals along the sampled gesture paths. They move with the gesture, respond to subsequent pushes, coast, and fade. After emission they ease into a downward fall as they fade, with no source above the frame. Fall speed controls their descent.

No motion creates no new trails or bubbles. Existing fluids, bubbles, and wisps continue their own response before fading.

Density controls sampling and the amount of material. Persistence controls retention or the imprint of movement. Intensity controls how strongly the sampled movement acts on the medium. Viscosity controls resistance and smoothing. Line width, under More, controls strand thickness or the width of sampled force corridors, and carries across medium changes.

Preview, still capture, and export advance by the same fixed simulation steps and seeded sampling. Drawing never advances the simulation. Material state and sampled paths use bounded storage.

Implementation: `LineSim.ts` selects paths. `PathField.ts` and `SampledMedium.ts` route sparse forces into native Water and Honey. `PathBubbleSim.ts` emits and moves independent gesture bubbles. `LinesMaterial.ts` renders Smoke with connected geometry in `LineGeometry.ts`. The shared material adapter selects the appropriate route while preserving the chosen medium's identity.
