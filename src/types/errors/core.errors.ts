export abstract class WrapperError extends Error {
  protected constructor(message: string, cause: unknown) {
    const fullMessage =
      cause instanceof Error
        ? `${message}: ${cause.message}`
        : `${message}: ${String(cause)}`;
    super(fullMessage);
    this.name = "WrapperError";
    if (cause instanceof Error && cause.stack) {
      this.stack = cause.stack;
    }
  }
}
