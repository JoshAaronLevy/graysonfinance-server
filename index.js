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
  console.log(`[Server] 📝 Received request for type: ${type}`);
  const inputs = req.body.inputs;
  console.log('[Server] 📥 Inputs received: ', inputs);

  console.log(`[Server] 🔍 Incoming request to /api/analyze/${type}`);

  if (!inputs?.query) {
    return res.status(400).json({ error: 'Missing required input: query' });
  }

  const appId = APP_ID_MAP[type];

  if (!appId || !apiKey) {
    return res.status(500).json({ error: 'Missing Dify App ID or API key' });
  }

  try {
    const userQuery = inputs.query;
    console.log(`[Server] 📤 Forwarding query to Dify app ${appId}: `, userQuery);

    const response = await axios.post(
      'https://api.dify.ai/v1/chat-messages',
      {
        query: userQuery,
        inputs: {},
        response_mode: 'blocking',
        conversation_id: null,
        user: 'moneybuddy-user'
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'x-app-id': appId
        }
      }
    );

    const answer = response.data.answer;
    console.log('[Server] 📥 Received response from Dify: ', answer);
    const outputs = response.data.outputs || {};
    console.log('[Server] 📦 Outputs from Dify: ', outputs);

    res.json({ answer, outputs });
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const errorData = error.response?.data || error.message;

    console.error(`[Server] ❌ Error calling Dify for type "${type}":`, error.message);
    console.error('[Server] 🔥 Full error object:', error);
    console.error('[Server] 🔥 Error response data:', errorData);

    res.status(statusCode).json({ error: errorData });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    message: 'MoneyBuddy Dify proxy is running',
    version: '2.0.2',
    supportedEndpoints: Object.keys(APP_ID_MAP).map(t => `/api/analyze/${t}`)
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Dify proxy server running on http://localhost:${PORT}`));
