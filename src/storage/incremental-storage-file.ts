import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { InvalidArgumentError } from "../types/errors/index.js";
import {
  AllDayNotionEvent,
  IncrementalStorageRepository,
  NotionIncrementalState,
  TimedNotionEvent,
} from "../types/incremental-storage.js";
import { Logger } from "../types/logger.js";

type SerializedTimedNotionEvent = Omit<
  TimedNotionEvent,
  "start" | "end" | "createdAt" | "updatedAt"
> & {
  start: string;
  end: string;
  createdAt: string;
  updatedAt: string;
};

type SerializedAllDayNotionEvent = Omit<
  AllDayNotionEvent,
  "createdAt" | "updatedAt"
> & {
  createdAt: string;
  updatedAt: string;
};

type SerializedNotionIncrementalState = {
  cacheSchemaVersion: number;
  lastFullSync: string;
  lastSynced: string;
  events: Record<
    string,
    SerializedTimedNotionEvent | SerializedAllDayNotionEvent
  >;
};

export class IncrementalStorageFileRepository
  implements IncrementalStorageRepository
{
  constructor(
    private readonly directoryPath: string,
    private readonly maxCacheAgeMs: number,
    private readonly logger: Logger | undefined,
    private readonly encoding: BufferEncoding = "utf8",
  ) {
    if (maxCacheAgeMs < 0) {
      throw new InvalidArgumentError(
        "maxCacheAgeMs",
        "must be greater than or equal to 0",
      );
    }
    this.directoryPath = path.resolve(this.directoryPath);

    // Ensure the directory exists
    if (!existsSync(this.directoryPath)) {
      throw new InvalidArgumentError("directoryPath", "folder does not exist");
    }
    if (!statSync(this.directoryPath).isDirectory()) {
      throw new InvalidArgumentError("directoryPath", "must be a directory");
    }
  }

  public async get(
    cacheKey: string,
  ): Promise<NotionIncrementalState | undefined> {
    const cacheFilePath = this.getCacheFilePath(cacheKey);
    try {
      if (!existsSync(cacheFilePath)) {
        return undefined;
      }

      const data = readFileSync(
        path.join(this.directoryPath, `${cacheKey}.json`),
        this.encoding,
      );
      const serializedState = this.deserializeState(data);
      const cacheVersion = serializedState.cacheSchemaVersion ?? 0;
      if (cacheVersion !== NotionIncrementalState.SchemaVersion) {
        this.logger?.debug?.(
          {
            cacheKey,
            cacheFilePath,
            expectedCacheVersion: NotionIncrementalState.SchemaVersion,
            cacheVersion,
          },
          "Cache format version mismatch; removing state file",
        );
        rmSync(cacheFilePath);
        return undefined;
      }

      const state = this.rehydrateState(serializedState);
      // invalidate cache if stale
      if (
        this.maxCacheAgeMs !== 0 &&
        Date.now() - state.lastFullSync.getTime() > this.maxCacheAgeMs
      ) {
        rmSync(cacheFilePath);
        return undefined;
      }
      return state;
    } catch (error) {
      this.logger?.error?.(
        { cacheFilePath, error },
        `Error accessing state file`,
      );
      return undefined;
    }
  }

  public async set(
    cacheKey: string,
    state: NotionIncrementalState,
  ): Promise<void> {
    const cacheFilePath = this.getCacheFilePath(cacheKey);
    try {
      const data = this.serializeState(state);
      writeFileSync(cacheFilePath, data, this.encoding);
    } catch (error) {
      this.logger?.error?.(
        { cacheFilePath, error },
        `Error writing state file`,
      );
    }
  }

  private getCacheFilePath(cacheKey: string): string {
    return path.join(this.directoryPath, `${cacheKey}.json`);
  }

  private serializeState(state: NotionIncrementalState): string {
    const serializedEvents = Object.fromEntries(
      Object.entries(state.events).map(([id, event]) => {
        if (event.kind === "timed") {
          const serialized: SerializedTimedNotionEvent = {
            ...event,
            start: event.start.toISOString(),
            end: event.end.toISOString(),
            createdAt: event.createdAt.toISOString(),
            updatedAt: event.updatedAt.toISOString(),
          };
          return [id, serialized];
        }
        const serialized: SerializedAllDayNotionEvent = {
          ...event,
          createdAt: event.createdAt.toISOString(),
          updatedAt: event.updatedAt.toISOString(),
        };
        return [id, serialized];
      }),
    );

    return JSON.stringify({
      cacheSchemaVersion: NotionIncrementalState.SchemaVersion,
      lastFullSync: state.lastFullSync.toISOString(),
      lastSynced: state.lastSynced.toISOString(),
      events: serializedEvents,
    } satisfies SerializedNotionIncrementalState);
  }

  private deserializeState(json: string): SerializedNotionIncrementalState {
    return JSON.parse(json) as SerializedNotionIncrementalState;
  }

  private rehydrateState(
    serialized: SerializedNotionIncrementalState,
  ): NotionIncrementalState {
    const eventEntries: Array<[string, TimedNotionEvent | AllDayNotionEvent]> =
      [];
    for (const [id, event] of Object.entries(serialized.events ?? {})) {
      if (event.kind === "timed") {
        const rehydrated: TimedNotionEvent = {
          ...event,
          start: new Date(event.start),
          end: new Date(event.end),
          createdAt: new Date(event.createdAt),
          updatedAt: new Date(event.updatedAt),
        };
        eventEntries.push([id, rehydrated]);
        continue;
      }

      if (event.kind === "all-day") {
        const rehydrated: AllDayNotionEvent = {
          ...event,
          createdAt: new Date(event.createdAt),
          updatedAt: new Date(event.updatedAt),
        };
        eventEntries.push([id, rehydrated]);
        continue;
      }

      this.logger?.warn?.(
        { cacheVersion: serialized.cacheSchemaVersion, id },
        "Unknown event kind found in cache; dropping entry",
      );
    }

    return new NotionIncrementalState(
      new Date(serialized.lastFullSync),
      new Date(serialized.lastSynced),
      Object.fromEntries(eventEntries),
    );
  }
}
