import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const BASE_URL = 'https://api.dify.ai/v1/workflows';

const WORKFLOW_MAP = {
  income: process.env.DIFY_INCOME_WORKFLOW_ID,
  debt: process.env.DIFY_DEBT_WORKFLOW_ID,
  expenses: process.env.DIFY_EXPENSES_WORKFLOW_ID,
  savings: process.env.DIFY_SAVINGS_WORKFLOW_ID
};

app.post('/api/analyze/:type', async (req, res) => {
  const { type } = req.params;
  const workflowId = WORKFLOW_MAP[type];

  if (!workflowId) {
    return res.status(400).json({ error: 'Invalid analysis type' });
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
    console.error('Dify API error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dify proxy server running on http://localhost:${PORT}`));
