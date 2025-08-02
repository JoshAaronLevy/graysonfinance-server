import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// Remove surrounding quotes from DATABASE_URL if present
const dbUrl = process.env.DATABASE_URL?.replace(/^'|'$/g, '') || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: dbUrl });

(async () => {
  try {
    console.log('🌱 Seeding database...');
    
    // Add any seed data here if needed
    // For now, we'll just verify the tables exist
    
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('📊 Available tables:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    // You can add specific seed data here, for example:
    // await pool.query('INSERT INTO some_table (column) VALUES ($1)', [value]);
    
    console.log("🎉 Database seeding completed successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();