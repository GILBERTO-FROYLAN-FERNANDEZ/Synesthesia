import { hashUnit } from '../shared/hashNoise';
import { PopMist } from './PopMist';
import { BubbleSim } from './BubbleSim';
import { ProjectedField, type FieldInput } from '../shared/fieldSampling';
import type { BubbleSimParams } from './mapping';

/** Existing falling particles pop on direct contact; other bubbles keep falling. */
export class ContactBubbleSim extends BubbleSim {
  readonly mist = new PopMist();
  private readonly returns = new Uint32Array(this.capacity);
  private returnSeed = 0;
  override reset(seed: number): void {
    super.reset(seed);
    this.mist.reset(seed);
    this.returnSeed = seed;
    this.returns.fill(0);
  }
  private readonly contact = new ProjectedField();
  override step(input: FieldInput, p: BubbleSimParams, dt: number): void {
    if (!(dt > 0)) return;
    this.mist.step(dt);
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
    for (let i = 0; i < this.count; i++) {
      if (this.wear[i] >= 1) continue;
      this.contact.sample(this.px[i] + this.dx[i], this.py[i] + this.dy[i]);
      if (Math.hypot(this.contact.u, this.contact.v) > 0.04) {
        this.wear[i] = 1;
        this.mist.emit(this.px[i] + this.dx[i], this.py[i] + this.dy[i], this.size[i]);
      }
    }
  }
}
