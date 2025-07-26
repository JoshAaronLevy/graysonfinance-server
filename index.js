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

app.post('/api/analyze/:type', async (req, res) => {
  const { type } = req.params;
  const userQuery = req.body.query;

  console.log(`\n[Server] 📝 Received request for type: ${type}`);
  console.log('[Server] 📥 Raw request body:', req.body);

  if (!userQuery || typeof userQuery !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid input: query' });
  }

  const appId = APP_ID_MAP[type];
  if (!appId || !apiKey) {
    return res.status(500).json({ error: 'Missing Dify App ID or API key' });
  }

  try {
    console.log(`[Server] 📤 Forwarding query to Dify app ID: ${appId}`);
    const response = await axios.post(
      'https://api.dify.ai/v1/chat-messages',
      {
        query: userQuery,
        inputs: {},
        response_mode: 'blocking',
        conversation_id: null,
        user: `test-${Date.now()}`
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'x-app-id': appId
        }
      }
    );

    console.log('[Server] 📥 Full response from Dify:');
    console.dir(response.data, { depth: null });

    const answer = response.data.answer;
    const outputs = response.data.outputs || {};
    const modelInfo = response.data.metadata || {}; // sometimes included

    console.log('[Server] 💬 Answer:', answer);
    console.log('[Server] 📦 Outputs:', outputs);
    console.log('[Server] 🧠 Model Metadata (if available):', modelInfo);

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
    version: '2.0.7',
    supportedEndpoints: Object.keys(APP_ID_MAP).map((t) => `/api/analyze/${t}`)
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Dify proxy server running on http://localhost:${PORT}`)
);
