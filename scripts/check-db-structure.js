import { sql } from '../db/neon.js';

async function checkDBStructure() {
  try {
    console.log('🔍 Checking current users table structure...');
    const result = await sql`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position;
    `;
    
    console.log('Current users table columns:');
    result.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    // Check if name column exists
    const nameColumn = result.find(col => col.column_name === 'name');
    const firstNameColumn = result.find(col => col.column_name === 'first_name');
    
    console.log('\n🔄 Column Status:');
    console.log(`  - name column exists: ${nameColumn ? '✅ YES' : '❌ NO'}`);
    console.log(`  - first_name column exists: ${firstNameColumn ? '✅ YES' : '❌ NO'}`);
    
    if (nameColumn && !firstNameColumn) {
      console.log('\n⚠️  Migration needed: name column still exists, first_name column missing');
      return 'migration_needed';
    } else if (!nameColumn && firstNameColumn) {
      console.log('\n✅ Migration successful: first_name column exists, name column removed');
      return 'migration_complete';
    } else if (nameColumn && firstNameColumn) {
      console.log('\n⚠️  Both columns exist: migration partially applied');
      return 'partial_migration';
    } else {
      console.log('\n❌ Neither column exists: unexpected state');
      return 'unexpected_state';
    }
    
  } catch (error) {
    console.error('❌ Error checking database structure:', error);
    throw error;
  }
}

checkDBStructure().catch(console.error);