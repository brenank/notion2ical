import assert from "node:assert";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test, { beforeEach, describe } from "node:test";

import { Client } from "@notionhq/client";
import nock from "nock";
// eslint-disable-next-line import-x/no-named-as-default-member -- nock.back is only available on the default import in ESM
const nockBack = nock.back;

import { Notion2ICal } from "../../src/index.js";
import { EmptyDateError } from "../../src/types/errors/index.js";

const expectedPath = path.join(import.meta.dirname, "expected");
const updateMocks = Boolean(process.env.UPDATE_MOCKS);
nockBack.fixtures = path.join(import.meta.dirname, "mocks");
nockBack.setMode(updateMocks ? "update" : "lockdown");

const updateExpected = Boolean(process.env.UPDATE_EXPECTED);

function assertMatchesFile(content: string, filepath: string) {
  if (updateExpected) {
    writeFileSync(filepath, content, "utf8");
    console.log(`Updated expected file: ${filepath}`);
    return;
  } else if (!existsSync(filepath)) {
    throw new Error(`Expected file ${filepath} does not exist.`);
  }

  const expected = readFileSync(filepath, "utf8").toString();
  assert.strictEqual(
    content,
    expected,
    `Content does not match expected file: ${filepath}`,
  );
}

function normalizeIcsForSnapshot(icsContent: string): string {
  return icsContent.replaceAll(
    /DTSTAMP:[^\n]+\n/g,
    "DTSTAMP:OMITTED_FOR_TEST_CONSISTENCY\n",
  );
}

function getTestName(name: string) {
  return name
    .replaceAll(" > ", "-")
    .replaceAll(/[^\dA-Za-z]/g, "-")
    .toLowerCase();
}

const databaseId = "21269e03eefe809883acf1859c722a49";
const titlePropertyName = "Name";
const datePropertyName = "Date";
const descriptionPropertyName = "Description";

// override fetch to disable gzip compression
const noCompressionFetch: typeof fetch = async (input, init = {}) => {
  const headers = new Headers(init.headers || {});
  // disable gzip compression
  headers.set("Accept-Encoding", "identity");

  return fetch(input, { ...init, headers });
};

describe("given with pageSize 1", async (s) => {
  const suiteName = getTestName(s.name);
  let notion2ical: Notion2ICal;

  beforeEach(() => {
    const notionClient = new Client({
      auth: process.env.NOTION_AUTH_TOKEN,
      fetch: noCompressionFetch,
    });
    notion2ical = new Notion2ICal({ notionClient, pageSize: 1 });
  });

  test("invalid title should return empty calendar", async (t) => {
    const { nockDone } = await nockBack(`${suiteName}.json`);

    const icsContent = await notion2ical.convert(
      databaseId,
      "noexist",
      datePropertyName,
      descriptionPropertyName,
      "Test Calendar",
      15 * 60 * 1000, // 15 minutes in milliseconds
    );

    assertMatchesFile(
      normalizeIcsForSnapshot(icsContent),
      path.join(expectedPath, `${getTestName(t.fullName)}.ics`),
    );
    nockDone();
  });

  test("invalid date should return empty calendar", async (t) => {
    const { nockDone } = await nockBack(`${suiteName}.json`);

    const icsContent = await notion2ical.convert(
      databaseId,
      titlePropertyName,
      "noexist",
      descriptionPropertyName,
      "Test Calendar",
      15 * 60 * 1000, // 15 minutes in milliseconds
    );

    assertMatchesFile(
      normalizeIcsForSnapshot(icsContent),
      path.join(expectedPath, `${getTestName(t.fullName)}.ics`),
    );
    nockDone();
  });

  test("invalid description should return empty calendar", async (t) => {
    const { nockDone } = await nockBack(`${suiteName}.json`);

    const icsContent = await notion2ical.convert(
      databaseId,
      titlePropertyName,
      datePropertyName,
      "noexist",
      "Test Calendar",
      15 * 60 * 1000, // 15 minutes in milliseconds
    );

    assertMatchesFile(
      normalizeIcsForSnapshot(icsContent),
      path.join(expectedPath, `${getTestName(t.fullName)}.ics`),
    );
    nockDone();
  });

  test("convert", async (t) => {
    const { nockDone } = await nockBack(`${suiteName}.json`);

    const icsContent = await notion2ical.convert(
      databaseId,
      titlePropertyName,
      datePropertyName,
      descriptionPropertyName,
      "Test Calendar",
      15 * 60 * 1000, // 15 minutes in milliseconds
    );

    assertMatchesFile(
      normalizeIcsForSnapshot(icsContent),
      path.join(expectedPath, `${getTestName(t.fullName)}.ics`),
    );
    nockDone();
  });

  test("convert with bounds", async (t) => {
    const { nockDone } = await nockBack(`${getTestName(t.fullName)}.json`);

    const icsContent = await notion2ical.convert(
      databaseId,
      titlePropertyName,
      datePropertyName,
      descriptionPropertyName,
      "Test Calendar",
      15 * 60 * 1000, // 15 minutes in milliseconds
      new Date("2025-07-29T00:00:00Z"), // Start date
      new Date("2025-08-07T12:34:59Z"), // End date
    );

    assertMatchesFile(
      normalizeIcsForSnapshot(icsContent),
      path.join(expectedPath, `${getTestName(t.fullName)}.ics`),
    );
    nockDone();
  });

  test("convert without description", async (t) => {
    const { nockDone } = await nockBack(`${suiteName}.json`);

    const icsContent = await notion2ical.convert(
      databaseId,
      titlePropertyName,
      datePropertyName,
      undefined,
      "Test Calendar",
      15 * 60 * 1000, // 15 minutes in milliseconds
    );

    assertMatchesFile(
      normalizeIcsForSnapshot(icsContent),
      path.join(expectedPath, `${getTestName(t.fullName)}.ics`),
    );
    nockDone();
  });
});

describe("given with pageSize 100", async (s) => {
  const suiteName = getTestName(s.name);
  let notion2ical: Notion2ICal;

  beforeEach(() => {
    const notionClient = new Client({
      auth: process.env.NOTION_AUTH_TOKEN,
      fetch: noCompressionFetch,
    });
    notion2ical = new Notion2ICal({
      notionClient,
      pageSize: 100,
      onPageError: (logger, error) => {
        if (error instanceof EmptyDateError) {
          return;
        }
        throw error;
      },
    });
  });

  test("invalid title should throw error", async () => {
    const { nockDone } = await nockBack(`${suiteName}.json`);

    await assert.rejects(
      () =>
        notion2ical.convert(
          databaseId,
          "noexist",
          datePropertyName,
          descriptionPropertyName,
          "Test Calendar",
          60 * 60 * 1000, // 60 minutes in milliseconds
        ),
      /MissingPropertyError: Missing property "noexist"/,
    );
    nockDone();
  });

  test("invalid date should throw error", async () => {
    const { nockDone } = await nockBack(`${suiteName}.json`);

    await assert.rejects(
      () =>
        notion2ical.convert(
          databaseId,
          "noexist",
          datePropertyName,
          descriptionPropertyName,
          "Test Calendar",
          60 * 60 * 1000, // 60 minutes in milliseconds
        ),
      /MissingPropertyError: Missing property "noexist"/,
    );
    nockDone();
  });

  test("invalid description should throw error", async () => {
    const { nockDone } = await nockBack(`${suiteName}.json`);

    await assert.rejects(
      () =>
        notion2ical.convert(
          databaseId,
          "noexist",
          datePropertyName,
          descriptionPropertyName,
          "Test Calendar",
          60 * 60 * 1000, // 60 minutes in milliseconds
        ),
      /MissingPropertyError: Missing property "noexist"/,
    );
    nockDone();
  });

  test("convert", async (t) => {
    const { nockDone } = await nockBack(`${suiteName}.json`);

    const icsContent = await notion2ical.convert(
      databaseId,
      titlePropertyName,
      datePropertyName,
      descriptionPropertyName,
      "Test Calendar",
      60 * 60 * 1000, // 60 minutes in milliseconds
    );

    assertMatchesFile(
      normalizeIcsForSnapshot(icsContent),
      path.join(expectedPath, `${getTestName(t.fullName)}.ics`),
    );
    nockDone();
  });

  test("convert without description", async (t) => {
    const { nockDone } = await nockBack(`${suiteName}.json`);

    const icsContent = await notion2ical.convert(
      databaseId,
      titlePropertyName,
      datePropertyName,
      undefined,
      "Test Calendar",
      60 * 60 * 1000, // 60 minutes in milliseconds
    );

    assertMatchesFile(
      normalizeIcsForSnapshot(icsContent),
      path.join(expectedPath, `${getTestName(t.fullName)}.ics`),
    );
    nockDone();
  });
});
