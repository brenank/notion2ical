import { WrapperError } from "./core.errors.js";

export class StorageError extends WrapperError {
  constructor(cause: unknown) {
    super("Storage operation failed", cause);
    this.name = "StorageError";
  }
}
