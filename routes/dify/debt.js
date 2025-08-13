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
  console.error('[Dify Debt Routes] ❌ DIFY_API_KEY is missing');
}

if (!DIFY_APP_ID) {
  console.error('[Dify Debt Routes] ❌ DIFY_GRAYSON_FINANCE_APP_ID is missing');
}

/**
 * POST /v1/dify/debt/analyze
 * Public endpoint for logged-out debt analysis
 */
router.post('/analyze', asyncHandler(async (req, res, next) => {
  try {
    const { query, conversationId } = req.body;
    
    // Validate input
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      const error = new ValidationError('query is required');
      error.code = 'BAD_REQUEST';
      throw error;
    }
    
    // Ensure required environment variables are present
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
    
    // Make request to Dify API
    const difyResponse = await axios.post(
      'https://api.dify.ai/v1/chat-messages',
      {
        query: query.trim(),
        inputs: {},
        response_mode: 'blocking',
        conversation_id: conversationId || null,
        user: 'public-user' // Anonymous user identifier
      },
      { 
        headers,
        timeout: 30000 // 30 second timeout
      }
    );
    
    // Use normalizer to extract correct flags from parsed JSON content
    const normalized = normalizeDifyResponse(difyResponse.data);
    
    // Return normalized response
    const mappedResponse = {
      text: normalized.text || 'I apologize, but I was unable to analyze your debt information. Please try again.',
      answer: normalized.answer,
      valid: normalized.valid,
      isValid: normalized.isValid,
      ambiguous: normalized.ambiguous,
      conversation_id: normalized.conversation_id,
      outputs: normalized.outputs,
      raw: normalized.raw
    };
    
    res.status(200).json(mappedResponse);
    
  } catch (error) {
    // Error logging
    console.error(`[Dify Debt] 🔥 Error in /analyze:`, {
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