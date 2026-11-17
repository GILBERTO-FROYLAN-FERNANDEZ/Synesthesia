# Ripples mapping

Choose Ripples beside Wake, Displacement, and Lines, then choose a medium.
Movement emits expanding effects at active locations. Quiet capture noise is ignored;
short local cooldowns prevent emission on every frame while allowing dense overlapping waves. Stronger movement produces more events. No movement means no new
events, while existing effects expand and fade independently.

- Water: concentric wave crests with directional surface highlights.
- Honey: rounded amber dollops that slowly spread and flatten into uneven puddles, that combine into shared pools where they overlap, with translucent amber color that becomes richer in overlapping areas, and soft directional shoulder highlights for slight depth, without dark sculpted shading or sharp glossy spots.
- Smoke: textured smoke loops with billowing, fibrous edges and uneven density. Compact rings expand and rise slowly, with a roughly 4.5-second baseline lifetime. Each ring continually softens and loses density as it grows, progressing from a small defined ring into a large faint wisp rather than holding uniform brightness. Smoke emissions are staggered, with slightly varied individual retention times and a consistent expansion rate.
- Bubbles: one bubble per touch event that expands in place, then swells slightly and breaks its shell into fragments without brightening near the end of its lifetime.

Density controls event frequency, Intensity controls strength, Persistence controls
lifetime, Viscosity controls expansion speed, and Ripple size controls scale. Range
controls the motion projection. Brightness, Hue, and relevant medium controls remain
available. These are initial prototype appearances, ready for movement testing.

RippleSim stores at most 768 events, with seeded placement and fixed-step aging.
RipplesMaterial draws instanced effects. Honey accumulates dollop thickness into a shared surface before shading, so overlaps join into pools; drawing
does not advance state. Live input, playback, stills, and exported video share the
same material adapter. Composition files store `visual.mapping: "ripples"` separately
from the selected medium.
