export abstract class NotionParseError extends Error {
  constructor(
    message: string,
    public readonly pageId: string,
    public readonly property?: string,
  ) {
    super(message);
    this.name = "NotionParseError";
  }
}

export class MissingPropertyError extends NotionParseError {
  constructor(pageId: string, property: string) {
    super(`Missing property "${property}"`, pageId, property);
    this.name = "MissingPropertyError";
  }
}

export class InvalidPropertyTypeError extends NotionParseError {
  constructor(
    pageId: string,
    property: string,
    actualType: string,
    expectedType: string,
  ) {
    super(
      `Property "${property}" is type "${actualType}", expected "${expectedType}"`,
      pageId,
      property,
    );
    this.name = "InvalidPropertyTypeError";
  }
}

export class EmptyDateError extends NotionParseError {
  constructor(pageId: string, detail: string) {
    super(`Date property empty: ${detail}`, pageId);
    this.name = "EmptyDateError";
  }
}

export class DateValueError extends NotionParseError {
  constructor(pageId: string, detail: string) {
    super(`Date property invalid: ${detail}`, pageId);
    this.name = "DateValueError";
  }
}
