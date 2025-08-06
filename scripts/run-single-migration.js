import { sql } from '../db/neon.js';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  try {
    const migrationPath = './migrations/005_rename_name_to_first_name.sql';
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Running migration 005_rename_name_to_first_name.sql...');
    await sql.unsafe(migrationSql);
    console.log('✅ Migration 005 completed successfully');
  } catch (error) {
    console.error('❌ Migration 005 failed:', error);
    process.exit(1);
  }
}

runMigration();