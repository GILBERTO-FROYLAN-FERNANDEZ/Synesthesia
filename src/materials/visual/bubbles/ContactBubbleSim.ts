import { hashUnit } from '../shared/hashNoise';
import { PopMist } from './PopMist';
import { BubbleSim } from './BubbleSim';
import { ProjectedField, type FieldInput } from '../shared/fieldSampling';
import type { BubbleSimParams } from './mapping';

/** Existing bubbles move normally; sharp local impulses pop only a few at a time. */
export class ContactBubbleSim extends BubbleSim {
  readonly mist = new PopMist();
  private readonly returns = new Uint32Array(this.capacity);
  private returnSeed = 0;
  private readonly previousSpeed = new Float64Array(this.capacity);
  private popCooldown = 0;
  override reset(seed: number): void {
    super.reset(seed);
    this.mist.reset(seed);
    this.returnSeed = seed;
    this.returns.fill(0);
    this.previousSpeed.fill(0);
    this.popCooldown = 0;
  }
  private readonly contact = new ProjectedField();
  override step(input: FieldInput, p: BubbleSimParams, dt: number): void {
    if (!(dt > 0)) return;
    this.mist.step(dt);
    this.popCooldown = Math.max(0, this.popCooldown - dt);
    // A popped particle rejoins the source above the frame instead of reforming in place.
    for (let i = 0; i < this.count; i++)
      if (this.wear[i] >= 2) {
        const generation = ++this.returns[i];
        // Spread re-entry across a complete fall cycle, not a shared pop-time cohort.
        // A new horizontal position also avoids tracing the erased gesture from above.
        const cycle = (this.worldHeight + 0.06) / Math.max(0.025, p.fallSpeed * this.fall[i]);
        this.birthDelay[i] = hashUnit(this.returnSeed + 31, i, generation) * cycle;
        this.px[i] = hashUnit(this.returnSeed + 47, i, generation) * this.worldWidth;
        this.py[i] = this.worldHeight + 0.03 + 0.05 * hashUnit(this.returnSeed + 59, i, generation);
        this.dx[i] = this.dy[i] = this.vx[i] = this.vy[i] = this.wear[i] = 0;
      }
    super.step(input, p, dt);
    this.contact.set(input, p.range, this.worldWidth * 1000, this.worldHeight * 1000);
    let popped = 0;
    for (let i = 0; i < this.count; i++) {
      const x = this.px[i] + this.dx[i],
        y = this.py[i] + this.dy[i];
      if (this.wear[i] >= 1 || this.birthDelay[i] > 0 || y < 0 || y > this.worldHeight) {
        this.previousSpeed[i] = 0;
        continue;
      }
      this.contact.sample(x, y);
      const speed = Math.hypot(this.contact.u, this.contact.v);
      const acceleration = (speed - this.previousSpeed[i]) / dt;
      this.previousSpeed[i] = speed;
      const resistance = 0.65 + 0.55 * hashUnit(this.returnSeed + 71, i, this.returns[i]);
      // Require both fast movement and a sharp onset. A held sweep must not erase the field.
      // Track speed even during cooldown so a pending burst cannot accumulate.
      if (this.popCooldown === 0 && popped < 3 && speed > resistance && acceleration > 5) {
        this.wear[i] = 1;
        this.mist.emit(x, y, this.size[i]);
        popped++;
      }
    }
    if (popped > 0) this.popCooldown = 0.12;
  }
}
