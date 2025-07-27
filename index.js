import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const APP_ID_MAP = {
  income: process.env.DIFY_INCOME_APP_ID,
  debt: process.env.DIFY_DEBT_APP_ID,
  expenses: process.env.DIFY_EXPENSES_APP_ID,
  savings: process.env.DIFY_SAVINGS_APP_ID,
  chats: process.env.DIFY_CHATS_APP_ID
};

const apiKey = process.env.DIFY_API_KEY;

if (!apiKey) {
  console.error('[Startup] ❌ DIFY_API_KEY is missing. Exiting...');
  process.exit(1);
} else {
  console.log(`[Startup] ✅ DIFY_API_KEY loaded (starts with: ${apiKey.slice(0, 6)}...)`);
}

app.post('/api/opening/:type', async (req, res) => {
  const type = req.params?.type?.toLowerCase();

  const customOpeners = {
    income: `Welcome to MoneyBuddy! Let's get started.\nWhat is your net monthly income after taxes?`,
    debt: `What does your current debt situation look like (excluding assets like a car or home)?\nYou can give a general response, like "$30,000", or a more detailed breakdown.`,
    expenses: 'Can you describe your typical monthly expenses? You can list categories or just give a ballpark figure.',
    savings: 'Do you currently have any savings? If so, how much and what are they for (e.g., emergency fund, vacation, etc.)?',
    chats: 'Welcome to MoneyBuddy! How can I assist you today? You can ask about anything related to your finances.'
  };

  const opener = customOpeners[type];

  if (!opener) {
    console.warn(`[Server] ⚠️ Unknown prompt type received: "${type}"`);
    return res.status(400).json({ error: `No opening message defined for type "${type}"` });
  }

  console.log(`[Server] 🚀 Sending custom opener for type "${type}": ${opener}`);
  res.json({ answer: opener });
});

app.post('/api/analyze/:type', async (req, res) => {
  const type = req.params?.type?.toLowerCase();
  const userQuery = (req.body.query || '').trim();

  console.log(`\n[Server] 📝 Received request for type: ${type}`);
  console.log('[Server] 📥 Raw request body:', req.body);

  if (!userQuery || typeof userQuery !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid input: query' });
  }

  const appId = APP_ID_MAP[type];
  if (!appId) {
    return res.status(500).json({ error: `Missing Dify App ID for type "${type}"` });
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'x-api-app-id': appId
  };

  try {
    console.log(`[Server] 📤 Forwarding query to Dify app ID: ${appId}`);
    console.log('[Server] 🧾 With headers:', headers);

    const response = await axios.post(
      'https://api.dify.ai/v1/chat-messages',
      {
        query: userQuery,
        inputs: {},
        response_mode: 'blocking',
        conversation_id: null,
        user: `test-${Date.now()}`
      },
      { headers }
    );

    const answer = response.data.answer;
    const outputs = response.data.outputs || {};

    console.log('[Server] 💬 Answer:', answer);
    console.log('[Server] 📦 Outputs:', outputs);

    res.json({ answer, outputs });
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const errorData = error.response?.data || error.message;

    console.error(`[Server] ❌ Error for Dify type "${type}":`, error.message);
    console.error('[Server] 🔥 Full error object:', error);
    console.error('[Server] 🔥 Error response data:', errorData);

    res.status(statusCode).json({ error: errorData });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    message: 'MoneyBuddy Dify proxy is running',
    version: '2.4.5',
    supportedEndpoints: Object.keys(APP_ID_MAP).map((t) => `/api/analyze/${t}`)
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Dify proxy server running on http://localhost:${PORT}`)
);
