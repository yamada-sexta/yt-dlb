// Source: yt_dlp/extractor/youtube/pot/_provider.py

export enum LogLevel {
  TRACE = 0,
  DEBUG = 10,
  INFO = 20,
  WARNING = 30,
  ERROR = 40,
}

export interface IEContentProviderLogger {
  readonly logLevel: LogLevel;
  trace(message: string): void;
  debug(message: string, options?: { once?: boolean }): void;
  info(message: string): void;
  warning(message: string, options?: { once?: boolean }): void;
  error(message: string, cause?: Error): void;
}

export class ConsoleIEContentProviderLogger implements IEContentProviderLogger {
  constructor(readonly prefix = "provider", readonly logLevel = LogLevel.INFO) {}

  trace(message: string): void {
    if (this.logLevel <= LogLevel.TRACE) {
      console.debug(`[${this.prefix}] ${message}`);
    }
  }

  debug(message: string): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      console.debug(`[${this.prefix}] ${message}`);
    }
  }

  info(message: string): void {
    if (this.logLevel <= LogLevel.INFO) {
      console.info(`[${this.prefix}] ${message}`);
    }
  }

  warning(message: string): void {
    if (this.logLevel <= LogLevel.WARNING) {
      console.warn(`[${this.prefix}] ${message}`);
    }
  }

  error(message: string, cause?: Error): void {
    console.error(`[${this.prefix}] ${message}`);
    if (cause) {
      console.error(cause);
    }
  }
}

export class IEContentProviderError extends Error {
  constructor(message = "content provider error", readonly expected = false) {
    super(message);
  }
}

export interface IEContentProviderHost {
  settings?: Record<string, readonly string[] | undefined>;
  request?(request: Request): Promise<Response>;
  reportWarning?(message: string): void;
}

export abstract class IEContentProvider {
  static readonly providerVersion: string = "0.0.0";
  static readonly bugReportLocation: string = "(developer has not provided a bug report location)";
  static readonly providerName: string;

  constructor(
    readonly host: IEContentProviderHost,
    readonly logger: IEContentProviderLogger = new ConsoleIEContentProviderLogger(),
    readonly settings: Record<string, readonly string[] | undefined> = {},
  ) {}

  get providerName(): string {
    return (this.constructor as typeof IEContentProvider).providerName;
  }

  get bugReportMessage(): string {
    const ctor = this.constructor as typeof IEContentProvider;
    return `please report this issue to the provider developer at ${ctor.bugReportLocation}.`;
  }

  abstract isAvailable(): boolean;

  close(): void {}

  configurationArg(key: string, defaultValue: readonly string[] = [], casesense = false): readonly string[] {
    return configurationArg(this.settings, key, defaultValue, casesense);
  }
}

export abstract class BuiltinIEContentProvider extends IEContentProvider {
  static override readonly providerVersion: string = "ytdlb";
  static override readonly bugReportLocation: string = "https://github.com/yt-dlp/yt-dlp";
}

export function configurationArg(
  config: Record<string, readonly string[] | undefined> | undefined,
  key: string,
  defaultValue: readonly string[] = [],
  casesense = false,
): readonly string[] {
  const value = config?.[key];
  if (!value) {
    return defaultValue;
  }
  return casesense ? [...value] : value.map((part) => part.toLowerCase());
}

export type ProviderConstructor<T extends IEContentProvider> = {
  readonly providerName: string;
  new (
    host: IEContentProviderHost,
    logger?: IEContentProviderLogger,
    settings?: Record<string, readonly string[] | undefined>,
  ): T;
};

export function registerProviderGeneric<T extends IEContentProvider>(
  provider: ProviderConstructor<T>,
  registry: Map<string, ProviderConstructor<T>>,
): ProviderConstructor<T> {
  if (registry.has(provider.providerName)) {
    throw new Error(`Content provider ${provider.providerName} already registered`);
  }
  registry.set(provider.providerName, provider);
  return provider;
}

export function registerPreferenceGeneric<T extends IEContentProvider>(
  registry: Set<(provider: T, ...args: readonly unknown[]) => number>,
  preference: (provider: T, ...args: readonly unknown[]) => number,
): typeof preference {
  registry.add(preference);
  return preference;
}
