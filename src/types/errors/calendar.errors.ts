import { WrapperError } from "./core.errors.js";

export class CalendarBuildError extends WrapperError {
  constructor(cause: unknown) {
    super("iCal build failed", cause);
    this.name = "CalendarBuildError";
  }
}

export class DuplicateEventError extends Error {
  constructor(eventId: string) {
    super(`Duplicate event ID detected: "${eventId}"`);
    this.name = "DuplicateEventError";
  }
}
