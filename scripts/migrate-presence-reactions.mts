/**
 * One-off additive migration: presence heartbeat column + reactions table.
 * Applied directly because `db:push` trips on pre-existing constraint drift
 * in project_members (and offers a truncate we will never take).
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

await sql`ALTER TABLE reprise.users ADD COLUMN IF NOT EXISTS last_seen_at timestamp`;
await sql`
  CREATE TABLE IF NOT EXISTS reprise.message_reactions (
    id serial PRIMARY KEY,
    message_id integer NOT NULL REFERENCES reprise.messages(id),
    user_id integer NOT NULL REFERENCES reprise.users(id),
    emoji text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT message_reactions_message_id_user_id_emoji_unique
      UNIQUE (message_id, user_id, emoji)
  )
`;
await sql`
  CREATE INDEX IF NOT EXISTS message_reactions_message_idx
    ON reprise.message_reactions (message_id)
`;

const cols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'reprise' AND table_name = 'users' AND column_name = 'last_seen_at'
`;
const tbl = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'reprise' AND table_name = 'message_reactions'
`;
console.log("last_seen_at present:", cols.length === 1);
console.log("message_reactions present:", tbl.length === 1);
