// 章送りのアニメーション。requestAnimationFrame で t = 0 → 1 を進める。
// 途中で finish() を呼ぶと、すぐ最後の状態にして終わる。

/** 動き出しと止まり際をゆっくりにする */
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Tween {
  private raf = 0;
  private running = false;
  private onFrame: ((t: number) => void) | null = null;
  private onDone: (() => void) | null = null;

  get isRunning(): boolean {
    return this.running;
  }

  /** duration ミリ秒かけて onFrame(0〜1) を呼ぶ。duration が 0 なら onFrame(1) だけ */
  start(duration: number, onFrame: (t: number) => void, onDone: () => void): void {
    this.finish();
    this.onFrame = onFrame;
    this.onDone = onDone;
    if (duration <= 0) {
      this.finish();
      return;
    }
    this.running = true;
    const startedAt = performance.now();
    const step = (now: number) => {
      if (!this.running) return;
      const t = Math.min(1, (now - startedAt) / duration);
      if (t >= 1) {
        this.finish();
        return;
      }
      this.onFrame?.(easeInOutCubic(t));
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** すぐ最後の状態にして終わる。動いていなければ何もしない */
  finish(): void {
    if (!this.onFrame) return;
    cancelAnimationFrame(this.raf);
    this.running = false;
    const frame = this.onFrame;
    const done = this.onDone;
    this.onFrame = null;
    this.onDone = null;
    frame(1);
    done?.();
  }
}
