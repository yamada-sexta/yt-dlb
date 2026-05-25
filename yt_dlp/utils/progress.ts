// Source: yt_dlp/utils/progress.py
// Port note: thread accounting is replaced by a single async flow counter; concurrent fragment workers are not enabled yet.

export class ProgressCalculator {
  static readonly SAMPLING_WINDOW = 3;
  static readonly SAMPLING_RATE = 0.05;
  static readonly GRACE_PERIOD = 1;

  downloaded: number;
  elapsed = 0;
  speed = new SmoothValue(0, 0.7);
  eta = new SmoothValue(null, 0.9);

  #total: number | null = 0;
  #startTime = performance.now() / 1000;
  #lastUpdate = this.#startTime;
  #lastSize = 0;
  #times = [this.#startTime];
  #downloadedSamples: number[];

  constructor(initial: number) {
    this.downloaded = initial || 0;
    this.#downloadedSamples = [this.downloaded];
  }

  get total(): number | null {
    return this.#total;
  }

  set total(value: number | null) {
    this.#total = value !== null && value < this.downloaded ? this.downloaded : value;
  }

  threadReset(): void {
    this.#lastSize = 0;
  }

  thread_reset(): void {
    this.threadReset();
  }

  update(size: number | null | undefined): void {
    if (!size) {
      return;
    }
    const delta = size - this.#lastSize;
    this.#lastSize = size;
    this.#update(delta);
  }

  #update(size: number): void {
    const currentTime = performance.now() / 1000;
    this.downloaded += size;
    this.elapsed = currentTime - this.#startTime;
    if (this.total !== null && this.downloaded > this.total) {
      this.#total = this.downloaded;
    }
    if (this.#lastUpdate + ProgressCalculator.SAMPLING_RATE > currentTime) {
      return;
    }
    this.#lastUpdate = currentTime;
    this.#times.push(currentTime);
    this.#downloadedSamples.push(this.downloaded);
    while (this.#times.length && this.#times[0] !== undefined && this.#times[0] < currentTime - ProgressCalculator.SAMPLING_WINDOW) {
      this.#times.shift();
      this.#downloadedSamples.shift();
    }
    if (this.#times.length < 2) {
      this.speed.reset();
      this.eta.reset();
      return;
    }
    const firstTime = this.#times[0];
    const firstSample = this.#downloadedSamples[0];
    if (firstTime === undefined || firstSample === undefined) {
      return;
    }
    const downloadTime = currentTime - firstTime;
    if (!downloadTime) {
      return;
    }
    this.speed.set((this.downloaded - firstSample) / downloadTime);
    if (this.total && this.speed.value && this.elapsed > ProgressCalculator.GRACE_PERIOD) {
      this.eta.set((this.total - this.downloaded) / this.speed.value);
    } else {
      this.eta.reset();
    }
  }
}

export class SmoothValue {
  value: number | null;
  smooth: number | null;
  readonly #initial: number | null;

  constructor(initial: number | null, readonly smoothing: number) {
    this.value = initial;
    this.smooth = initial;
    this.#initial = initial;
  }

  set(value: number): void {
    this.value = value;
    this.smooth = this.smooth === null ? value : (1 - this.smoothing) * value + this.smoothing * this.smooth;
  }

  reset(): void {
    this.value = this.#initial;
    this.smooth = this.#initial;
  }
}
