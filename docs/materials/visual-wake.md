# Wake mapping appearance

Wake retains its existing movement-driven trail emission and simulation. Water, Honey,
and Smoke use the shared material surface shader, also used by Displacement and the
native fluid trails in Lines. Empty regions remain black, so surface lighting appears
only where the movement has deposited material.

Water uses refraction and surface reflections, Honey uses amber transmission and soft
surface light, and Smoke uses translucent pale density and soft shading. Bubbles uses
the same pearl rims, restrained directional tint, rounder silhouettes, softer wobble,
and non-additive blending as the newer mappings. Its existing falling, pushing, and
popping behavior remains unchanged.
