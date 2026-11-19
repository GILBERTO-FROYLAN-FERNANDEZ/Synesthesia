# Warping prototype

Choose Warping in the mapping selector. Its scene picker offers Color field, Grass,
and Falling bubbles instead of Water, Honey, Smoke, and Bubbles. Switching into Warping
starts with Color field; switching back from a warp scene selects Water.

- Color field fills the stage with anchored color patches. Movement applies a smooth radial expansion to the existing color surface, like a Liquify Expand brush. A persistent inverse coordinate map composes the distortion over time so held movement keeps stretching the same artwork; inactive areas gradually return to their original coordinates. Spatially smoothed influence avoids abrupt brush edges without blurring the colors.
- Grass blades bend from fixed roots in the movement direction and spring back quickly.
- Falling bubbles move independently, popping on contact with movement while untouched particles continue falling. Popped bubbles release a short-lived spray of fine droplets and soft mist that drifts downward and fades, then recycle above the frame at independently staggered times and new horizontal positions, avoiding rows of returning bubbles. The spray is seeded and bounded to 2,048 particles.

Intensity sets the deformation strength, Persistence sets recovery time, Viscosity
sets resistance, Density sets scene detail, and Scene scale sets element size. Range,
Brightness, and Hue remain available. There is an existing scene at rest, so unlike
Ripples, no gesture is needed to make the picture visible.

LiquifySim maintains the accumulated color coordinate map. WarpSim maintains the local Grass spring field; falling bubbles use their native particle simulation with contact popping. The WebGL renderer
samples it smoothly to deform each scene. Seeded scene layout, fixed simulation steps,
and drawing without advancing state keep live preview, playback, stills, and video
exports consistent. Composition files save the mapping and scene independently.
