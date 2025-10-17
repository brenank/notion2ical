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
  IncrementalStorageRepository,
  NotionIncrementalState,
} from "../types/incremental-storage.js";
import { Logger } from "../types/logger.js";

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
      const state = this.deserializeState(data);

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
    return JSON.stringify({
      ...state,
      lastFullSync: state.lastFullSync.toISOString(),
      lastSynced: state.lastSynced.toISOString(),
      events: Object.fromEntries(
        Object.entries(state.events).map(([id, event]) => [
          id,
          {
            ...event,
            start: event.start.toISOString(),
            end: event.end ? event.end.toISOString() : undefined,
            createdAt: event.createdAt.toISOString(),
            updatedAt: event.updatedAt.toISOString(),
          },
        ]),
      ),
    });
  }

  private deserializeState(json: string): NotionIncrementalState {
    const deserialized = JSON.parse(json) as {
      lastFullSync: string;
      lastSynced: string;
      events: Record<
        string,
        {
          id: string;
          title: string;
          start: string;
          end: string;
          description: string;
          createdAt: string;
          updatedAt: string;
        }
      >;
    };
    return new NotionIncrementalState(
      new Date(deserialized.lastFullSync),
      new Date(deserialized.lastSynced),
      Object.fromEntries(
        Object.entries(deserialized.events).map(([id, event]) => [
          id,
          {
            ...event,
            start: new Date(event.start),
            end: new Date(event.end),
            createdAt: new Date(event.createdAt),
            updatedAt: new Date(event.updatedAt),
          },
        ]),
      ),
    );
  }
}
