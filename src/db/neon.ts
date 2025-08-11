import { neon } from '@neondatabase/serverless';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Remove surrounding quotes from DATABASE_URL if present
const dbUrl = process.env.DATABASE_URL?.replace(/^'|'$/g, '') || process.env.DATABASE_URL;

// Initialize Neon database connection
export const sql = neon(process.env.DATABASE_URL);

// Export shared pool instance for reuse across the application
export const pool = new Pool({ connectionString: dbUrl });

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    await sql`SELECT version()`;
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// Helper function to run a query and log results
export async function runQuery(query: TemplateStringsArray, ...params: any[]): Promise<any> {
  try {
    const result = await sql(query, ...params);
    return result;
  } catch (error) {
    console.error('❌ Query failed:', error);
    throw error;
  }
}