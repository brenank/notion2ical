/* eslint-disable unicorn/prevent-abbreviations */
export interface Logger {
  debug?: (obj: Record<string, unknown>, msg: string) => void;
  info?: (obj: Record<string, unknown>, msg: string) => void;
  warn?: (obj: Record<string, unknown>, msg: string) => void;
  error?: (obj: Record<string, unknown>, msg: string) => void;
}
/* eslint-enable unicorn/prevent-abbreviations */
