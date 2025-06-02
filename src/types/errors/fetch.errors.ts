import { WrapperError } from "./core.errors.js";

export class NotionQueryError extends WrapperError {
  constructor(cause: unknown) {
    super("Notion query failed", cause);
    this.name = "NotionQueryError";
  }
}

export class PaginationError extends Error {
  constructor(message: string) {
    super(`Pagination error: ${message}`);
    this.name = "PaginationError";
  }
}
