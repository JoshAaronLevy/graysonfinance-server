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
    console.log('🔄 Running database migrations...');
    
    const files = readdirSync(migrationsDir).sort();
    for (const file of files) {
      if (file.endsWith('.sql')) {
        const sql = readFileSync(path.join(migrationsDir, file), "utf8");
        console.log(`📄 Running migration: ${file}`);
        await pool.query(sql);
        console.log(`✅ Migration completed: ${file}`);
      }
    }
    
    console.log("🎉 All migrations completed successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();