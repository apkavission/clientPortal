/**
 * Write down what the database actually is.
 *
 *     npm run gen:types
 *
 * Reads `information_schema` over a normal connection and emits
 * `src/types/database.generated.ts` — every table, every column, its type and
 * whether it is nullable, plus every enum.
 *
 * ---------------------------------------------------------------------------
 * **Why not `supabase gen types`.** It needs either a management token with
 * privileges this account does not have, or Docker to run its own metadata
 * container. Neither is available on the machine this is developed on, which is
 * why the types were hand-written for a fortnight and why "regenerate them" sat
 * on the not-done list that whole time. A tool nobody can run is not a tool.
 *
 * **This file does not replace `database.ts`.** That one is hand-written on
 * purpose: it carries the comments explaining why a column exists, which a
 * generator cannot know and which are the most useful thing in it. What this
 * gives is the second opinion — `src/types/conformance.ts` compares the two at
 * compile time, so the hand-written file can no longer quietly disagree with the
 * database without `tsc` saying so.
 */
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";

const SCHEMA = "portal";
const OUT = "src/types/database.generated.ts";

const config = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);

const ref = new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

/*
  The pooler, not the direct host.

  New Supabase projects have no IPv4 address on `db.<ref>.supabase.co`, so a
  direct connection fails to resolve on most machines. The region is read from
  the environment rather than guessed, and defaults to the one this project is
  in.
*/
const client = new pg.Client({
  host: `aws-0-${config.SUPABASE_REGION ?? "ap-south-1"}.pooler.supabase.com`,
  port: 5432,
  user: `postgres.${ref}`,
  password: config.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

await client.connect();

/** Postgres types, as TypeScript sees them once PostgREST has been through. */
function tsType(column) {
  const { data_type: type, udt_name: udt } = column;

  if (type === "USER-DEFINED") return `Database["${SCHEMA}"]["Enums"]["${udt}"]`;
  if (type === "ARRAY") {
    /* `_text` is how Postgres names text[]. Only the element type matters here,
       and every array in this schema is a text array today. */
    return udt === "_text" ? "string[]" : "unknown[]";
  }

  switch (type) {
    case "uuid":
    case "text":
    case "character varying":
    case "date":
    case "timestamp with time zone":
    case "timestamp without time zone":
    case "time without time zone":
      return "string";
    case "integer":
    case "bigint":
    case "smallint":
    case "numeric":
    case "real":
    case "double precision":
      return "number";
    case "boolean":
      return "boolean";
    case "jsonb":
    case "json":
      return "Json";
    default:
      return "unknown";
  }
}

const { rows: enums } = await client.query(
  /* `enumlabel` is of Postgres type `name`, and node-pg has no parser for an
     array of those — it comes back as the literal string "{a,b,c}" and calling
     .map on it throws. Cast to text[], which it does parse. */
  `select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
     from pg_type t
     join pg_enum e on e.enumtypid = t.oid
     join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = $1
    group by t.typname
    order by t.typname`,
  [SCHEMA],
);

const { rows: columns } = await client.query(
  `select c.table_name, c.column_name, c.data_type, c.udt_name,
          c.is_nullable, c.column_default, t.table_type
     from information_schema.columns c
     join information_schema.tables t
       on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = $1
    order by c.table_name, c.ordinal_position`,
  [SCHEMA],
);

await client.end();

const tables = new Map();
for (const column of columns) {
  if (!tables.has(column.table_name)) tables.set(column.table_name, []);
  tables.get(column.table_name).push(column);
}

const lines = [
  "/**",
  " * Generated from the live database. Do not edit.",
  " *",
  " *     npm run gen:types",
  " *",
  " * The hand-written `database.ts` is the one the application imports — it",
  " * carries the reasoning a generator cannot know. This file exists so that one",
  " * can be checked against reality: `conformance.ts` compares them at compile",
  " * time, and `tsc` fails if they have drifted apart.",
  " */",
  "",
  "export type Json =",
  "  | string",
  "  | number",
  "  | boolean",
  "  | null",
  "  | { [key: string]: Json | undefined }",
  "  | Json[];",
  "",
  "export type Database = {",
  `  ${SCHEMA}: {`,
  "    Tables: {",
];

for (const [table, cols] of [...tables.entries()].sort()) {
  const isView = cols[0].table_type !== "BASE TABLE";

  lines.push(`      /** ${isView ? "A view." : "A table."} */`);
  lines.push(`      ${table}: {`);
  lines.push("        Row: {");
  for (const column of cols) {
    const nullable = column.is_nullable === "YES" ? " | null" : "";
    lines.push(`          ${column.column_name}: ${tsType(column)}${nullable};`);
  }
  lines.push("        };");

  /* Insert: anything with a default, a nullable column, or a view's column is
     optional — the database will fill it in or the write is not possible. */
  lines.push("        Insert: {");
  for (const column of cols) {
    const optional =
      isView || column.column_default !== null || column.is_nullable === "YES";
    const nullable = column.is_nullable === "YES" ? " | null" : "";
    lines.push(
      `          ${column.column_name}${optional ? "?" : ""}: ${tsType(column)}${nullable};`,
    );
  }
  lines.push("        };");

  lines.push("        Update: {");
  for (const column of cols) {
    const nullable = column.is_nullable === "YES" ? " | null" : "";
    lines.push(`          ${column.column_name}?: ${tsType(column)}${nullable};`);
  }
  lines.push("        };");

  /* Required by postgrest-js, even when empty: a table without this key fails
     the `GenericSchema` test and collapses the entire schema type to `never`,
     which shows up as `rpc()` taking an argument of type `undefined`. Found in
     the clinic demo on 2026-08-31, an hour after the generator was written. */
  lines.push("        Relationships: [];");
  lines.push("      };");
}

lines.push("    };");
lines.push("    Views: Record<never, never>;");
lines.push("    Functions: Record<never, never>;");
lines.push("    Enums: {");
for (const row of enums) {
  lines.push(`      ${row.name}: ${row.labels.map((l) => `"${l}"`).join(" | ")};`);
}
lines.push("    };");
lines.push("    CompositeTypes: Record<never, never>;");
lines.push("  };");
lines.push("};");
lines.push("");

writeFileSync(OUT, lines.join("\n"), "utf8");

console.log(
  `${OUT}: ${tables.size} tables and views, ${enums.length} enums, from the live database`,
);
