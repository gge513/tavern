import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Reprise shares a Neon instance with the week-1 project; everything lives
  // in the `reprise` pg schema and drizzle-kit is fenced to it so a push can
  // never touch the other project's tables.
  schemaFilter: ["reprise"],
});
