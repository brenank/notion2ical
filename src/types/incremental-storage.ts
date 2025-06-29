export type NotionPageId = string;

export interface NotionEvent {
  id: NotionPageId;
  title: string;
  start: Date;
  end: Date;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NotionEventMap = Record<NotionPageId, NotionEvent>;

export interface NotionIncrementalState {
  lastFullSync: Date;
  lastSynced: Date;
  events: NotionEventMap;
}

export interface IncrementalStorageRepository {
  get(cacheKey: string): Promise<NotionIncrementalState | undefined>;

  set(cacheKey: string, state: NotionIncrementalState): Promise<void>;
}
