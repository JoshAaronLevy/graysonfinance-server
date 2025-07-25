import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'MoneyBuddy server is running' });
});

const BASE_URL = 'https://api.dify.ai/v1';

const WORKFLOW_MAP = {
  income: process.env.DIFY_INCOME_WORKFLOW_ID,
  debt: process.env.DIFY_DEBT_WORKFLOW_ID,
  expenses: process.env.DIFY_EXPENSES_WORKFLOW_ID,
  savings: process.env.DIFY_SAVINGS_WORKFLOW_ID,
  chats: process.env.DIFY_CHATS_WORKFLOW_ID
};

app.post('/api/analyze/:type', async (req, res) => {
  console.log('Request: ', req);
  const { type } = req.params;
  const workflowId = WORKFLOW_MAP[type];

  console.log(`[Server] Incoming request to /api/analyze/${type}`);
  console.log(`[Server] Workflow ID: ${workflowId}`);
  console.log(`[Server] Inputs:`, inputs);

  if (!workflowId) {
    console.warn(`❌ Invalid analysis type requested: ${type}`);
    return res.status(400).json({ error: `Invalid analysis type: ${type}` });
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/${workflowId}/run`,
      { inputs: req.body.inputs },
      {
        headers: {
          Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('🔥 Dify API error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Dify proxy server running on http://localhost:${PORT}`));
