import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/status', (req, res) => {
  const routes = [];

  if (app._router && app._router.stack) {
    app._router.stack.forEach((middleware) => {
      if (middleware.route) {
        const methods = Object.keys(middleware.route.methods)
          .map((m) => m.toUpperCase())
          .join(', ');
        routes.push({ method: methods, path: middleware.route.path });
      } else if (middleware.name === 'router' && middleware.handle?.stack) {
        middleware.handle.stack.forEach((handler) => {
          const route = handler.route;
          if (route) {
            const methods = Object.keys(route.methods)
              .map((m) => m.toUpperCase())
              .join(', ');
            routes.push({ method: methods, path: route.path });
          }
        });
      }
    });
  }

  res.json({
    status: 'ok',
    message: 'MoneyBuddy server is running',
    version: '1.1.3',
    endpoints: routes
  });
});

const BASE_URL = 'https://api.dify.ai/v1/workflows';

const WORKFLOW_MAP = {
  income: process.env.DIFY_INCOME_WORKFLOW_ID,
  debt: process.env.DIFY_DEBT_WORKFLOW_ID,
  expenses: process.env.DIFY_EXPENSES_WORKFLOW_ID,
  savings: process.env.DIFY_SAVINGS_WORKFLOW_ID,
  chats: process.env.DIFY_CHATS_WORKFLOW_ID
};

app.post('/api/analyze/:type', async (req, res) => {
  console.log('[Server] req: ', req.body);
  const { type } = req.params;
  const inputs = req.body.inputs;
  const workflowId = WORKFLOW_MAP[type];

  console.log(`[Server] 🔵 Incoming request to /api/analyze/${type}`);
  console.log(`[Server] 🧠 Workflow ID: ${workflowId}`);
  console.log(`[Server] 📦 Inputs:`, inputs);

  if (!workflowId) {
    console.warn(`[Server] ❌ Invalid analysis type: ${type}`);
    return res.status(400).json({ error: `Invalid analysis type: ${type}` });
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/${workflowId}/run`,
      { inputs },
      {
        headers: {
          Authorization: `Bearer ${process.env.DIFY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`[Server] ✅ Response from Dify:`, response.data);
    res.json(response.data);
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const errorData = error.response?.data || error.message;

    console.error(`[Server] 🔥 Dify API Error`);
    console.error(`[Server] Status Code: ${statusCode}`);
    console.error(`[Server] Message:`, error.message);
    console.error(`[Server] Full Response:`, errorData);

    res.status(statusCode).type('application/json').json({ error: errorData });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Dify proxy server running on http://localhost:${PORT}`));
