// Source: new shared TypeScript migration helper.
// There is no direct Python source; this makes unfinished Bun migration surfaces fail loudly.

export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} is not implemented in ytdlb yet`);
    this.name = "NotImplementedError";
  }
}
