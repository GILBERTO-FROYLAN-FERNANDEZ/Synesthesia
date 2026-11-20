# Movement

Movement combines the former Wake, Displacement, and Lines mappings. Two independent controls determine how movement affects the selected medium:

- **Movement coverage — Full / Sampled:** act across the moving area or along sparse, continuous gesture paths.
- **Material source — Existing / Generated:** move material already in the scene, or emit material through movement.

Full + Existing retains Displacement. Full + Generated retains Wake, with bubbles now emitted across moving areas. Sampled + Generated retains Lines. Sampled + Existing rasterizes gesture paths into a sparse force field that drives the native medium simulation without emitting new material.

Water, Honey, Smoke, and Bubbles support all four combinations. Existing fields renew or replenish over time as before; gestures do not inject additional material. Generated bubbles start empty, inherit a restrained push, then fall and fade. Sampled width controls the area influenced by a gesture path.

For compatibility, compositions still store the original preset IDs (`displacement`, `wake`, `lines`) and the new `sampled-displacement` preset. Preview, snapshots, undo, stills, and video exports use the same saved preset. Existing compositions open with their corresponding control settings; no migration is necessary.

Ripples remains a separate mapping. Grass is available in Movement with Existing material and either Full or Sampled coverage; Generated is disabled for rooted grass. Warping and Color field have been removed. Saved Warping Grass compositions convert to Movement Grass; Color field compositions fall back to Signature.

Existing bubbles retain their falling field and normal push response. A sharp local impulse can pop up to three bubbles per burst, with a short cooldown and varied resistance. Popped bubbles release seeded mist and re-enter from above on independent delays. Sustained movement does not trigger repeated pops in already-contacted bubbles. Generated bubbles and Ripples bubbles retain their separate behavior.

Sampled Grass sweeps a small group of neighboring roots along each path, with a brief fading influence so its springs have time to respond. It remains localized instead of using the whole movement field.
