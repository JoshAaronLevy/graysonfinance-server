import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Initialize Neon database connection
export const sql = neon(process.env.DATABASE_URL);

// Test database connection
export async function testConnection() {
  try {
    const result = await sql`SELECT version()`;
    console.log('✅ Database connected successfully');
    console.log('📊 PostgreSQL version:', result[0].version);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// Helper function to run a query and log results
export async function runQuery(query, params = []) {
  try {
    const result = await sql(query, ...params);
    return result;
  } catch (error) {
    console.error('❌ Query failed:', error);
    throw error;
  }
}