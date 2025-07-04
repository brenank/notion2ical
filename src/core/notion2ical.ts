import { createHash } from "node:crypto";

import { Client, PageObjectResponse } from "@notionhq/client";
import {
  createEvents,
  EventAttributes,
  HeaderAttributes,
  ReturnObject as ICalResult,
} from "ics";

import {
  CalendarBuildError,
  DateValueError,
  DuplicateEventError,
  EmptyDateError,
  InvalidArgumentError,
  InvalidPropertyTypeError,
  MissingPropertyError,
  NotionQueryError,
  PaginationError,
  StorageError,
} from "../types/errors/index.js";
import {
  IncrementalStorageRepository,
  NotionEvent,
  NotionEventMap,
  NotionIncrementalState,
} from "../types/incremental-storage.js";
import { Logger } from "../types/logger.js";

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface Notion2ICalOptions {
  /**
   * The Notion client to use for querying the database.
   */
  notionClient: Client;

  /**
   * Page size for Notion database queries.
   * If not provided, defaults to 100.
   */
  pageSize?: number;

  /**
   * Called whenever a single page fails to parse.
   * Throwing an error here will abort the whole convert() call;
   * returning void will simply skip that page.
   * @param logger - The logger to use for optionally logging the error.
   * @param error - The error that occurred while processing the page.
   * @param page - The Notion page that caused the error.
   * If not provided, the page will be skipped.
   */
  onPageError?: (
    logger: Logger | undefined,
    error: Error,
    page: PageObjectResponse,
  ) => void;

  /**
   * Optional logger for debugging and information messages.
   * If not provided, no logging will be done.
   */
  logger?: Logger;

  /**
   * Optional storage for incremental updates.
   * If provided, the converter will store the last synced state
   * and only fetch pages that have been modified since the last sync.
   */
  incrementalUpdateStorage?: IncrementalStorageRepository;
}

export class Notion2ICal {
  private readonly notionClient: Client;
  private readonly logger: Logger | undefined;
  private readonly pageSize: number;
  private readonly incrementalUpdateStorage?: IncrementalStorageRepository;
  private readonly onPageError?: Notion2ICalOptions["onPageError"];

  constructor(options: Notion2ICalOptions) {
    this.notionClient = options.notionClient;
    this.logger = options.logger;
    this.pageSize = options.pageSize || 100;
    this.incrementalUpdateStorage = options.incrementalUpdateStorage;
    this.onPageError =
      options.onPageError ??
      ((logger, error, page) => {
        logger?.warn?.(
          { pageId: page.id, err: error },
          "Page processing failed",
        );
      });

    if (!this.notionClient) {
      throw new InvalidArgumentError("notionClient", "is required");
    }
    if (this.pageSize <= 0) {
      throw new InvalidArgumentError("pageSize", "must be a positive integer");
    }
  }

  public async convert(
    databaseId: string,
    titlePropertyName: string,
    datePropertyName: string,
    descPropertyName: string | undefined,
    calendarName: string,
    defaultDurationMs: number,
    fromDate?: Date,
    untilDate?: Date,
  ): Promise<string> {
    this.logger?.debug?.(
      { databaseId, fromDate, untilDate },
      "Starting conversion",
    );

    if (fromDate && untilDate && fromDate > untilDate) {
      throw new InvalidArgumentError(
        "fromDate",
        `must not be after untilDate (${fromDate.toISOString()} > ${untilDate.toISOString()})`,
      );
    }

    const syncedAt = new Date();
    const cacheKey = this.getCacheKey(
      databaseId,
      titlePropertyName,
      datePropertyName,
      descPropertyName,
      calendarName,
      defaultDurationMs,
      fromDate,
      untilDate,
    );
    const state = await this.getCachedState(cacheKey);
    const lastFullSync = state?.lastFullSync ?? syncedAt;
    const eventsMap: NotionEventMap = state?.events ?? {};

    const pages = await this.fetchAllPages(
      databaseId,
      datePropertyName,
      fromDate,
      untilDate,
      state?.lastSynced,
    );

    this.accumulateEvents(pages, {
      titlePropertyName,
      datePropertyName,
      descPropertyName,
      defaultDurationMs,
      eventsMap,
    });

    await this.saveCachedState(cacheKey, {
      lastSynced: syncedAt,
      lastFullSync,
      events: eventsMap,
    });

    const calendarResult = this.buildCalendar(eventsMap, calendarName);
    if (!calendarResult.value) {
      throw new CalendarBuildError(calendarResult.error);
    }
    return calendarResult.value;
  }

  private async fetchAllPages(
    databaseId: string,
    datePropertyName: string,
    from?: Date,
    until?: Date,
    editedSince?: Date,
  ): Promise<PageObjectResponse[]> {
    const all: PageObjectResponse[] = [];
    const seenCursors = new Set<string | undefined>();
    let cursor: string | undefined = undefined;

    do {
      if (seenCursors.has(cursor)) {
        throw new PaginationError(`Cursor ${cursor} repeated`);
      } else {
        seenCursors.add(cursor);
      }

      try {
        const filter: Parameters<Client["databases"]["query"]>[0]["filter"] = {
          and: [],
        };
        if (from) {
          filter.and.push({
            date: {
              on_or_after: from.toISOString(),
            },
            property: datePropertyName,
          });
        }
        if (until) {
          filter.and.push({
            date: {
              on_or_before: until.toISOString(),
            },
            property: datePropertyName,
          });
        }
        if (editedSince) {
          filter.and.push({
            last_edited_time: {
              on_or_after: editedSince.toISOString(),
            },
            timestamp: "last_edited_time",
          });
        }

        const resp = await this.notionClient.databases.query({
          database_id: databaseId,
          start_cursor: cursor,
          page_size: this.pageSize,
          filter,
        });
        all.push(...(resp.results as PageObjectResponse[]));
        cursor = resp.next_cursor ?? undefined;
      } catch (error) {
        throw new NotionQueryError(error);
      }
    } while (cursor);
    this.logger?.debug?.({ count: all.length }, "Fetched pages");
    return all;
  }

  private accumulateEvents(
    pages: PageObjectResponse[],
    options: {
      titlePropertyName: string;
      datePropertyName: string;
      descPropertyName?: string;
      defaultDurationMs: number;
      eventsMap: NotionEventMap;
    },
  ) {
    for (const page of pages) {
      if (options.eventsMap[page.id]) {
        const error = new DuplicateEventError(page.id);
        this.onPageError?.(this.logger, error, page);
        continue;
      }

      this.logger?.debug?.({ page }, "Extracting event details");
      const result = this.extractEventDetails(
        options.titlePropertyName,
        options.datePropertyName,
        options.descPropertyName,
        options.defaultDurationMs,
        page,
      );
      if (result.ok) {
        const event = result.value;
        options.eventsMap[event.id] = event;
        this.logger?.info?.({ eventId: event.id }, "Event added");
      } else {
        this.onPageError?.(this.logger, result.error, page);
      }
    }
  }

  private getCacheKey(
    databaseId: string,
    titlePropertyName: string,
    datePropertyName: string,
    descPropertyName: string | undefined,
    calendarName: string,
    defaultDurationMs: number,
    fromDate?: Date,
    untilDate?: Date,
  ): string {
    const input = [
      databaseId,
      titlePropertyName,
      datePropertyName,
      descPropertyName,
      calendarName,
      defaultDurationMs,
      fromDate?.toISOString(),
      untilDate?.toISOString(),
    ].join("-");
    return createHash("md5").update(input).digest("hex");
  }

  private async getCachedState(
    cacheKey: string,
  ): Promise<NotionIncrementalState | undefined> {
    try {
      if (this.incrementalUpdateStorage) {
        const state = await this.incrementalUpdateStorage?.get(cacheKey);
        if (state) {
          this.logger?.debug?.(
            { cacheKey, state: state },
            "Incremental state loaded",
          );
        } else {
          this.logger?.debug?.({ cacheKey }, "No cached state found");
        }
        return state;
      }
    } catch (error) {
      throw new StorageError(error);
    }
  }

  private async saveCachedState(
    cacheKey: string,
    state: NotionIncrementalState,
  ) {
    try {
      if (this.incrementalUpdateStorage) {
        await this.incrementalUpdateStorage?.set(cacheKey, state);
        this.logger?.debug?.({ state: state }, "Incremental state saved");
      }
    } catch (error) {
      throw new StorageError(error);
    }
  }

  private buildCalendar(eventsMap: NotionEventMap, name: string): ICalResult {
    const icsEvents: EventAttributes[] = [];
    for (const event of Object.values(eventsMap)) {
      icsEvents.push({
        uid: event.id,
        start: event.start.getTime(),
        end: event.end.getTime(),
        title: event.title,
        description: event.description,
        created: event.createdAt.getTime(),
        lastModified: event.updatedAt.getTime(),
      });
    }

    const headers: HeaderAttributes = {
      calName: name,
      productId: "Notion2ICal",
    };
    const calendar = createEvents(icsEvents, headers);
    this.logger?.info?.(
      { total: Object.keys(eventsMap).length },
      "Calendar built",
    );
    return calendar;
  }

  private extractEventDetails(
    titlePropertyName: string,
    datePropertyName: string,
    descriptionPropertyName: string | undefined,
    defaultDurationMs: number,
    page: PageObjectResponse,
  ): Result<NotionEvent, Error> {
    const properties = page.properties;
    const pageId = page.id;

    // 1) Title must exist and be correct type
    const titleProperty = properties[titlePropertyName];
    if (!titleProperty)
      return {
        ok: false,
        error: new MissingPropertyError(pageId, titlePropertyName),
      };
    if (titleProperty.type !== "title")
      return {
        ok: false,
        error: new InvalidPropertyTypeError(
          pageId,
          titlePropertyName,
          titleProperty.type,
          "title",
        ),
      };

    // 2) Date must exist and be correct type
    const dateProperty = properties[datePropertyName];
    if (!dateProperty)
      return {
        ok: false,
        error: new MissingPropertyError(pageId, datePropertyName),
      };
    if (dateProperty.type !== "date")
      return {
        ok: false,
        error: new InvalidPropertyTypeError(
          pageId,
          datePropertyName,
          dateProperty.type,
          "date",
        ),
      };
    if (!dateProperty.date?.start)
      return {
        ok: false,
        error: new EmptyDateError(
          pageId,
          `No start date provided for property "${datePropertyName}"`,
        ),
      };

    // 3) Description (if provided) must be rich_text
    let description = "";
    if (descriptionPropertyName) {
      const descProperty = properties[descriptionPropertyName];
      if (!descProperty)
        return {
          ok: false,
          error: new MissingPropertyError(pageId, descriptionPropertyName),
        };
      if (descProperty.type !== "rich_text")
        return {
          ok: false,
          error: new InvalidPropertyTypeError(
            pageId,
            descriptionPropertyName,
            descProperty.type,
            "rich_text",
          ),
        };
      description = descProperty.rich_text[0]?.plain_text ?? "";
    }

    // 4) Build and return
    const start = new Date(dateProperty.date.start);
    if (Number.isNaN(start.getTime()))
      return {
        ok: false,
        error: new DateValueError(
          pageId,
          `Unparseable start date: ${dateProperty.date.start}`,
        ),
      };
    const end =
      dateProperty.date.end === null
        ? new Date(start.getTime() + defaultDurationMs)
        : new Date(dateProperty.date.end);
    if (Number.isNaN(end.getTime()))
      return {
        ok: false,
        error: new DateValueError(
          pageId,
          `Unparseable end date: ${dateProperty.date.end}`,
        ),
      };

    return {
      ok: true,
      value: {
        id: pageId,
        title: titleProperty.title[0]?.plain_text ?? "Untitled",
        start,
        end,
        description,
        createdAt: new Date(page.created_time),
        updatedAt: new Date(page.last_edited_time),
      },
    };
  }
}
