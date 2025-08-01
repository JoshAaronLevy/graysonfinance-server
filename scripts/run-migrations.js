import { readdirSync, readFileSync } from "fs";
import { Pool } from "pg";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Remove surrounding quotes from DATABASE_URL if present
const dbUrl = process.env.DATABASE_URL?.replace(/^'|'$/g, '') || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: dbUrl });
const migrationsDir = path.join(process.cwd(), "migrations");

(async () => {
  try {
    const files = readdirSync(migrationsDir).sort();
    for (const file of files) {
      const sql = readFileSync(path.join(migrationsDir, file), "utf8");
      console.log(`Running migration: ${file}`);
      await pool.query(sql);
    }
    console.log("✅ Migrations complete");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
})();