/** A live-only silence gate. Recorded signatures keep their original sound mapping. */
export class LiveMotionActivity {
  private moving = false;
  private quietSince: number | null = null;
  private lastFrame = 0;

  update(energy: number, now: number, sensitivity: number): boolean {
    this.active(now);
    this.lastFrame = now;
    const scale = Math.max(0.2, Math.min(2, sensitivity));
    // Higher sensitivity lowers the tracker's noise floor, but must not lower
    // the audible threshold into ordinary camera noise.
    // The Perform meter shows raw energy × 5. Real-camera stillness was observed
    // around 0–2% there; the old 0.004 threshold sat inside that noise band.
    const enter = Math.max(0.01, 0.01 / scale);
    const leave = enter * 0.6;
    if (energy >= enter) {
      this.moving = true;
      this.quietSince = null;
    } else if (this.moving && energy < leave) {
      if (this.quietSince === null) this.quietSince = now;
      if (now - this.quietSince >= 180) this.moving = false;
    } else {
      this.quietSince = null;
    }
    return this.active(now);
  }

  active(now: number): boolean {
    if (now - this.lastFrame >= 350) this.moving = false;
    return this.moving;
  }
}
