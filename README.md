# notion2ical

[![npm version](https://img.shields.io/npm/v/notion2ical.svg)](https://www.npmjs.com/package/notion2ical) [![GitHub repository](https://img.shields.io/badge/GitHub-Repo-blue?style=flat-square&logo=github)](https://github.com/brenank/notion2ical)

A library that converts a Notion calendar database into iCalendar (`.ics`) format.

**Looking for a command-line tool?** Check out [notion2ical-cli](https://www.npmjs.com/package/notion2ical-cli) for quick exports from the terminal.

## Features

- Export Notion calendar databases to `.ics` files
- Supports incremental updates for efficient syncing
- Customizable event mapping and error handling
- Written in TypeScript, ESM-first

## Installation

```sh
npm install notion2ical
```

## Usage

```ts
import { Notion2ICal } from "notion2ical";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const converter = new Notion2ICal({
  notionClient: notion,
  // Optional: pageSize, logger, onPageError, incrementalUpdateStorage
});

const icsString = await converter.convert(
  "your-database-id",
  "Name", // Title property name
  "Date", // Date property name
  "Description", // (Optional) Description property name
  "My Calendar", // Calendar name
  60 * 60 * 1000, // Default event duration in ms (e.g., 1 hour)
);

// Save to file
import { writeFileSync } from "node:fs";
writeFileSync("calendar.ics", icsString);
```

## API

### `Notion2ICal(options)`

- `notionClient` (**required**): An instance of `@notionhq/client`.
- `pageSize`: Number of pages per Notion API request (default: 100).
- `onPageError`: Callback for handling page-level errors.
- `logger`: Optional logger for debug/info/warn.
- `incrementalUpdateStorage`: Optional storage for incremental sync.

### `convert(databaseId, titleProperty, dateProperty, descProperty, calendarName, defaultDurationMs, fromDate?, untilDate?)`

Converts a Notion database to an iCalendar string.

- `databaseId`: The Notion database ID.
- `titleProperty`: Name of the title property.
- `dateProperty`: Name of the date property.
- `descProperty`: (Optional) Name of the description property.
- `calendarName`: Name for the calendar.
- `defaultDurationMs`: Default event duration in milliseconds.
- `fromDate`, `untilDate`: (Optional) Date range for events.

Returns: `Promise<string>` (the `.ics` file content).

## Development

- Clone the repo and install dependencies:
  ```sh
  npm install
  ```
- Build:
  ```sh
  npm run build
  ```
- Run tests:
  ```sh
  npm test
  ```

## License

MIT

---

**notion2ical** is not affiliated with Notion Labs, Inc.
