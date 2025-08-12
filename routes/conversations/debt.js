import express from 'express';
import axios from 'axios';
import { ValidationError, ExternalServiceError } from '../../src/errors/index.js';
import { asyncHandler } from '../../src/utils/asyncHandler.js';
import { normalizeDifyResponse } from '../../src/lib/dify-normalizer.js';

const router = express.Router();

// Environment variables for Dify integration
const DIFY_API_KEY = process.env.DIFY_API_KEY;
const DIFY_APP_ID = process.env.DIFY_GRAYSON_FINANCE_APP_ID; // Public app, not PRO

if (!DIFY_API_KEY) {
  console.error('[Debt Conversation Routes] ❌ DIFY_API_KEY is missing');
}

if (!DIFY_APP_ID) {
  console.error('[Debt Conversation Routes] ❌ DIFY_GRAYSON_FINANCE_APP_ID is missing');
}

/**
 * GET /v1/conversations/debt
 * Public endpoint to get debt conversation status (no auth required)
 * Returns benign "no history yet" structure when no conversation exists
 */
router.get('/', asyncHandler(async (req, res, next) => {
  console.log(`[Debt Conversations] 📥 ${req.method} ${req.originalUrl}`);
  
  try {
    // For public routes, we don't maintain conversation history in DB
    // Always return a "no conversation yet" response with 200 status
    res.status(200).json({
      conversationId: null,
      messages: []
    });
  } catch (error) {
    console.error(`[Debt Conversations] 🔥 Error in GET /:`, {
      message: error.message
    });
    
    res.status(500).json({ 
      error: 'Failed to fetch debt conversation',
      message: 'Please try again later'
    });
  }
}));

/**
 * POST /v1/conversations/debt
 * Public endpoint to create/start debt conversation (no auth required)
 * Creates a new Dify conversation and returns the conversation ID
 */
router.post('/', asyncHandler(async (req, res, next) => {
  console.log(`[Debt Conversations] 📥 ${req.method} ${req.originalUrl}`);
  
  try {
    const { query, inputs = {} } = req.body;
    
    // Validate required environment variables
    if (!DIFY_API_KEY || !DIFY_APP_ID) {
      const error = new ExternalServiceError('Dify', 'Configuration error: missing API credentials');
      error.code = 'INTERNAL_ERROR';
      error.status = 500;
      throw error;
    }
    
    // Prepare headers for Dify API call
    const headers = {
      'Authorization': `Bearer ${DIFY_API_KEY}`,
      'Content-Type': 'application/json',
      'x-api-app-id': DIFY_APP_ID
    };
    
    // Create initial message or use default debt opening
    const initialQuery = query || "I want to discuss my debt situation and get help with debt management.";
    
    // Make request to Dify API to start new conversation
    const difyResponse = await axios.post(
      'https://api.dify.ai/v1/chat-messages',
      {
        query: initialQuery,
        inputs: { topic: 'debt', ...inputs },
        response_mode: 'blocking',
        conversation_id: null, // Always create new conversation for public requests
        user: 'public-user' // Anonymous user identifier
      },
      { 
        headers,
        timeout: 30000 // 30 second timeout
      }
    );
    
    // Use normalizer to extract correct flags from parsed JSON content
    const normalized = normalizeDifyResponse(difyResponse.data);
    
    // Return the conversation with initial message
    const response = {
      conversationId: normalized.conversation_id,
      message: {
        role: 'assistant',
        content: normalized.text || 'I\'m here to help you with your debt situation. Please tell me about your current debt.',
        userData: {
          valid: normalized.valid,
          isValid: normalized.isValid,
          ambiguous: normalized.ambiguous
        },
        metadata: normalized.outputs,
        createdAt: new Date().toISOString()
      }
    };
    
    console.log(`[Debt Conversations] ✅ Conversation created successfully:`, {
      conversationId: normalized.conversation_id
    });
    
    res.status(201).json(response);
    
  } catch (error) {
    console.error(`[Debt Conversations] 🔥 Error in POST /:`, {
      status: error.response?.status,
      message: error.message
    });
    
    if (error.response?.status) {
      // Dify API error
      const status = error.response.status;
      const errorData = error.response.data || error.message;
      
      const difyError = new ExternalServiceError('Dify', 'Dify call failed', { status, errorData });
      difyError.code = 'UPSTREAM_ERROR';
      difyError.status = 502;
      throw difyError;
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      const timeoutError = new ExternalServiceError('Dify', 'Dify call failed', { timeout: true });
      timeoutError.code = 'UPSTREAM_ERROR';
      timeoutError.status = 502;
      throw timeoutError;
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      const networkError = new ExternalServiceError('Dify', 'Dify call failed', { networkError: true });
      networkError.code = 'UPSTREAM_ERROR';
      networkError.status = 502;
      throw networkError;
    }
    
    // Re-throw if it's already a structured error
    throw error;
  }
}));

export default router;