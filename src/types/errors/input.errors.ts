export class InvalidArgumentError extends Error {
  constructor(
    public readonly argumentName: string,
    public readonly reason: string,
  ) {
    super(`Invalid argument "${argumentName}": ${reason}`);
    this.name = "InvalidArgumentError";
  }
}
