import assert from "node:assert";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach, describe } from "node:test";

import { IncrementalStorageFileRepository } from "../../src/storage/incremental-storage-file.js";
import { InvalidArgumentError } from "../../src/types/errors/index.js";
import { NotionIncrementalState } from "../../src/types/incremental-storage.js";

describe("IncrementalStorageFileRepository", () => {
  let temporaryDirectory: string;
  let repo: IncrementalStorageFileRepository;
  let state: NotionIncrementalState;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(
      path.join(os.tmpdir(), "inc-storage-test-"),
    );
    repo = new IncrementalStorageFileRepository(
      temporaryDirectory,
      0,
      undefined,
    );
    state = new NotionIncrementalState(
      new Date("2023-01-01T00:00:00Z"),
      new Date("2023-01-01T01:00:00Z"),
      {
        event1: {
          id: "event1",
          title: "Test Event 1",
          description: "some description",
          start: new Date("2023-01-01T10:00:00Z"),
          end: new Date("2023-01-01T11:00:00Z"),
          createdAt: new Date("2023-01-01T09:00:00Z"),
          updatedAt: new Date("2023-01-01T09:30:00Z"),
        },
        event2: {
          id: "event2",
          title: "Test Event 2",
          description: "some description 2",
          start: new Date("2023-01-02T10:00:00Z"),
          end: new Date("2023-01-02T11:00:00Z"),
          createdAt: new Date("2023-01-02T09:00:00Z"),
          updatedAt: new Date("2023-01-02T09:30:00Z"),
        },
      },
    );
  });

  afterEach(() => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  test("constructor throws if maxCacheAgeMs <= 0", () => {
    assert.throws(
      () =>
        new IncrementalStorageFileRepository(temporaryDirectory, -1, undefined),
      InvalidArgumentError,
    );
    assert.throws(
      () =>
        new IncrementalStorageFileRepository(temporaryDirectory, -2, undefined),
      InvalidArgumentError,
    );
  });

  test("constructor throws if folder does not exist", () => {
    const badPath = path.join(temporaryDirectory, "does-not-exist");
    assert.throws(
      () => new IncrementalStorageFileRepository(badPath, 0, undefined),
      InvalidArgumentError,
    );
  });

  test("set and get roundtrip", async () => {
    const cacheKey = "foo";
    await repo.set(cacheKey, state);
    const loaded = await repo.get(cacheKey);
    assert.deepStrictEqual(loaded, state);
  });

  test("get returns undefined if file does not exist", async () => {
    const loaded = await repo.get("nope");
    assert.strictEqual(loaded, undefined);
  });

  test("get invalidates cache if maxCacheAgeMs exceeded", async () => {
    const cacheKey = "baz";
    state.lastFullSync = new Date(Date.now() - 100_000);
    await repo.set(cacheKey, state);
    const verifyGiven = await repo.get(cacheKey);
    assert.notStrictEqual(verifyGiven, undefined);

    // Create repo with short maxCacheAgeMs
    const repo2 = new IncrementalStorageFileRepository(
      temporaryDirectory,
      1,
      undefined,
    );
    const loaded = await repo2.get(cacheKey);
    assert.strictEqual(loaded, undefined);
    // File should be deleted
    assert.strictEqual(
      existsSync(path.join(temporaryDirectory, `${cacheKey}.json`)),
      false,
    );
  });

  test("get returns undefined on JSON parse error", async () => {
    const cacheKey = "badjson";
    writeFileSync(
      path.join(temporaryDirectory, `${cacheKey}.json`),
      "not-json",
      "utf8",
    );
    const repo2 = new IncrementalStorageFileRepository(
      temporaryDirectory,
      0,
      undefined,
    );
    const loaded = await repo2.get(cacheKey);
    assert.strictEqual(loaded, undefined);
  });

  test("getCacheFilePath returns correct path", () => {
    const cacheKey = "abc";
    const expected = path.join(temporaryDirectory, "abc.json");
    // @ts-expect-error private method
    assert.strictEqual(repo.getCacheFilePath(cacheKey), expected);
  });
});
