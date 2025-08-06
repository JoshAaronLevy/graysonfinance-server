import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// Remove surrounding quotes from DATABASE_URL if present
const dbUrl = process.env.DATABASE_URL?.replace(/^'|'$/g, '') || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: dbUrl });

(async () => {
  try {
    console.log('🔄 Resetting database...');
    console.log('⚠️  WARNING: This will drop all tables and data!');
    
    // Drop existing tables in correct order (considering foreign key constraints)
    console.log('🗑️  Dropping existing tables...');
    
    await pool.query('DROP TABLE IF EXISTS sessions CASCADE');
    console.log('✅ Dropped sessions table');
    
    await pool.query('DROP TABLE IF EXISTS users CASCADE');
    console.log('✅ Dropped users table');
    
    // Recreate tables by running migrations
    console.log('🔨 Recreating tables...');
    
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        clerk_user_id VARCHAR(255) UNIQUE,
        first_name VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        email_verified TIMESTAMP,
        image TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created users table');
    
    // Create index on clerk_user_id for performance
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id)');
    console.log('✅ Created index on clerk_user_id');
    
    console.log("🎉 Database reset completed successfully");
    console.log("💡 Run 'npm run db:seed' to add initial data if needed");
    process.exit(0);
  } catch (err) {
    console.error("❌ Database reset failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();