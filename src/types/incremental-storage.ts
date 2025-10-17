export type NotionPageId = string;

export type DateOnly = [year: number, month: number, day: number];

interface BaseNotionEvent {
  id: NotionPageId;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TimedNotionEvent extends BaseNotionEvent {
  kind: "timed";
  start: Date;
  end: Date;
}

export interface AllDayNotionEvent extends BaseNotionEvent {
  kind: "all-day";
  start: DateOnly;
  end: DateOnly;
}

export type NotionEvent = TimedNotionEvent | AllDayNotionEvent;

export type NotionEventMap = Record<NotionPageId, NotionEvent>;

export class NotionIncrementalState {
  public static readonly SchemaVersion: number = 1;

  constructor(
    public lastFullSync: Date,
    public lastSynced: Date,
    public events: NotionEventMap,
  ) {}
}

export interface IncrementalStorageRepository {
  get(cacheKey: string): Promise<NotionIncrementalState | undefined>;

  set(cacheKey: string, state: NotionIncrementalState): Promise<void>;
}
