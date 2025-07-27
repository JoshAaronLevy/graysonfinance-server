import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const apiKey = process.env.DIFY_API_KEY;

const APP_ID_MAP = {
  debt: process.env.DIFY_DEBT_APP_ID,
  // income: process.env.DIFY_INCOME_APP_ID,
  // expenses: process.env.DIFY_EXPENSES_APP_ID,
  // savings: process.env.DIFY_SAVINGS_APP_ID,
  // chats: process.env.DIFY_CHATS_APP_ID
};

if (!apiKey) {
  console.error('[Startup] ❌ DIFY_API_KEY is missing. Exiting...');
  process.exit(1);
} else {
  console.log(`[Startup] ✅ DIFY_API_KEY loaded (starts with: ${apiKey.slice(0, 6)}...)`);
}

app.post('/api/opening/:type', async (req, res) => {
  const type = req.params?.type?.toLowerCase();

  const customOpeners = {
    debt: `What does your current debt situation look like (excluding assets like a car or home)?\nYou can give a general response, like "$30,000", or a more detailed breakdown.`,
    income: `Welcome to MoneyBuddy! Let's get started.\nWhat is your net monthly income after taxes?`,
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

app.post('/api/analyze/debt', async (req, res) => {
  const type = req.params?.type?.toLowerCase();
  const userQuery = (req.body.query || '').trim();
  const userId = uuidv4();

  console.log(`\n[Server] 📝 Received request for type: ${type}`);
  console.log('[Server] 📥 Raw request body:', req.body);
  console.log(`[Server] 🧑‍💻 Generated user ID: ${userId}`);

  if (!userQuery || typeof userQuery !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid input: query' });
  }

  const appId = process.env.DIFY_DEBT_APP_ID;

  if (!appId) {
    return res.status(500).json({ error: `Missing Dify App ID for type "${type}"` });
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'x-api-app-id': appId
  };

  try {
    console.log(`[Server] 📤 Forwarding query to Dify (App ID: ${appId})`);
    console.log('[Server] 🧾 Headers:', headers);

    const response = await axios.post(
      'https://api.dify.ai/v1/chat-messages',
      {
        query: userQuery,
        inputs: {},
        response_mode: 'blocking',
        conversation_id: null,
        user: userId
      },
      { headers }
    );

    const { answer, outputs = {}, conversation_id } = response.data;

    console.log('[Server] 💬 Answer:', answer);
    console.log('[Server] 📦 Outputs:', outputs);
    console.log(`[Server] 🧑‍💻 Returned user ID: ${userId}`);
    console.log(`[Server] 🧵 Returned conversation ID: ${conversation_id}`);

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
    version: '2.4.7',
    supportedEndpoints: Object.keys(APP_ID_MAP).map((t) => `/api/analyze/${t}`)
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Dify proxy server running on http://localhost:${PORT}`)
);
