import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPROVAL_STATUS_LABEL,
  APPROVAL_TONE,
  BOARD_COLUMNS,
  HEALTH_LABEL,
  HEALTH_TONE,
  PHASE_STATUS_LABEL,
  PHASE_TONE,
  REQUEST_STATUS_LABEL,
  REQUEST_TONE,
  REQUIREMENT_STATUS_LABEL,
  REQUIREMENT_TONE,
  STAGE_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TASK_TONE,
} from "@/lib/labels";

/**
 * Every enum value has a word and a colour.
 *
 * This is the test that keeps working after today. A `Record<Enum, string>` is
 * already checked by the compiler — add a value to the union and TypeScript
 * refuses the map until it is filled in.
 *
 * What the compiler cannot see is the **database**. A migration adding a value
 * to `portal.task_status` does not touch TypeScript at all, so the union in
 * `types/database.ts` silently disagrees with Postgres, the map still compiles,
 * and the first anybody knows is a page rendering `undefined` where a status
 * should be.
 *
 * So this reads the enum values out of the migration files — the only place the
 * database's own vocabulary is written down — and checks each one has a label.
 * The failure it catches is exactly the one a type system cannot.
 */

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");

/** Every value of one enum, read from the SQL that creates it. */
function enumValues(name: string): string[] {
  const sql = [
    "20260829000001_portal_foundation.sql",
    "20260829000002_portal_projects.sql",
    "20260829000003_portal_tasks.sql",
  ]
    .map((file) => readFileSync(resolve(MIGRATIONS, file), "utf8"))
    .join("\n");

  const declaration = new RegExp(
    `create type portal\\.${name} as enum\\s*\\(([^)]*)\\)`,
    "i",
  ).exec(sql);

  if (!declaration) throw new Error(`portal.${name} is not created in any migration`);

  return [...declaration[1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

const CASES: [string, Record<string, string>][] = [
  ["project_stage", STAGE_LABEL],
  ["phase_status", PHASE_STATUS_LABEL],
  ["task_status", TASK_STATUS_LABEL],
  ["task_priority", TASK_PRIORITY_LABEL],
  ["request_status", REQUEST_STATUS_LABEL],
  ["requirement_status", REQUIREMENT_STATUS_LABEL],
  ["approval_status", APPROVAL_STATUS_LABEL],
  ["health", HEALTH_LABEL],
];

describe("labels cover the database", () => {
  it.each(CASES)("every %s value has a label", (name, labels) => {
    const missing = enumValues(name).filter((value) => !labels[value]);

    expect(missing, `no label for: ${missing.join(", ")}`).toEqual([]);
  });

  it("no label is left as the raw database value", () => {
    /*
      "in_progress" as a label means somebody filled the map in by copying the
      key. It compiles, it is not missing, and it still shows the reader the
      shape of the table.
    */
    for (const [, labels] of CASES) {
      for (const [key, label] of Object.entries(labels)) {
        expect(label, `${key} is not translated`).not.toBe(key);
        expect(label).not.toMatch(/_/);
      }
    }
  });
});

describe("tones cover the same ground", () => {
  const TONE_CASES: [string, Record<string, string>][] = [
    ["task_status", TASK_TONE],
    ["request_status", REQUEST_TONE],
    ["requirement_status", REQUIREMENT_TONE],
    ["approval_status", APPROVAL_TONE],
    ["phase_status", PHASE_TONE],
    ["health", HEALTH_TONE],
  ];

  it.each(TONE_CASES)("every %s value has a colour", (name, tones) => {
    const missing = enumValues(name).filter((value) => !tones[value]);

    expect(missing, `no tone for: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("the board", () => {
  it("shows columns a person works through, and not the ones they do not", () => {
    // `cancelled` is deliberately absent: giving it a column invites it to fill
    // up, and nobody works through cancelled work.
    expect(BOARD_COLUMNS).not.toContain("cancelled");
    expect(BOARD_COLUMNS).toContain("in_progress");
    expect(BOARD_COLUMNS).toContain("done");
  });

  it("only names statuses the database actually has", () => {
    const real = enumValues("task_status");

    for (const column of BOARD_COLUMNS) {
      expect(real, `${column} is not a task_status`).toContain(column);
    }
  });
});
