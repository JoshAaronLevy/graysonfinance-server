import axios from 'axios';
import crypto from 'crypto';

// Mock Clerk webhook payload for user.created event
const mockClerkPayload = {
  type: 'user.created',
  data: {
    id: 'user_test_123456789',
    email_addresses: [
      {
        email_address: 'test.user@example.com',
        verification: {
          status: 'verified'
        }
      }
    ],
    first_name: 'John',
    last_name: 'Doe',
    created_at: Date.now(),
    updated_at: Date.now()
  }
};

// Function to generate Svix headers (mock for testing)
function generateSvixHeaders(payload) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const svixId = `msg_${crypto.randomBytes(16).toString('hex')}`;
  
  // In a real scenario, this would use the actual webhook secret to generate the signature
  // For testing purposes, we'll use a mock signature
  const signature = `v1,${crypto.randomBytes(32).toString('base64')}`;
  
  return {
    'svix-id': svixId,
    'svix-timestamp': timestamp,
    'svix-signature': signature,
    'content-type': 'application/json'
  };
}

async function testClerkWebhook() {
  try {
    console.log('🧪 Testing Clerk webhook with mock user.created event...\n');
    
    const payload = JSON.stringify(mockClerkPayload);
    const headers = generateSvixHeaders(payload);
    
    console.log('📤 Sending webhook payload:');
    console.log('Event Type:', mockClerkPayload.type);
    console.log('User ID:', mockClerkPayload.data.id);
    console.log('Email:', mockClerkPayload.data.email_addresses[0].email_address);
    console.log('First Name:', mockClerkPayload.data.first_name);
    console.log('Last Name:', mockClerkPayload.data.last_name);
    console.log('\n📡 Headers:', headers);
    
    const response = await axios.post('http://localhost:3000/v1/webhooks/clerk', payload, {
      headers: {
        ...headers,
        'User-Agent': 'Svix-Webhooks/1.0'
      },
      timeout: 10000
    });
    
    console.log('\n✅ Webhook Response:');
    console.log('Status:', response.status);
    console.log('Data:', response.data);
    
    // Test database query to verify user was created
    console.log('\n🔍 Verifying user in database...');
    
    // Query the database to see if user was created
    const { sql } = await import('../db/neon.js');
    const users = await sql`
      SELECT id, auth_id, email, first_name, created_at 
      FROM users 
      WHERE auth_id = ${mockClerkPayload.data.id}
    `;
    
    if (users.length > 0) {
      console.log('✅ User found in database:');
      console.log('Database ID:', users[0].id);
      console.log('Auth ID:', users[0].auth_id);
      console.log('Email:', users[0].email);
      console.log('First Name:', users[0].first_name);
      console.log('Created At:', users[0].created_at);
    } else {
      console.log('❌ User not found in database');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

// Run the test
testClerkWebhook();