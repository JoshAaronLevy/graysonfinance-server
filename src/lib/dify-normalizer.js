/**
 * Dify Response Normalizer
 * 
 * This utility normalizes Dify API responses to ensure consistent structure
 * and correct flag values for the frontend. The main purpose is to parse
 * JSON content that may be embedded in the text/answer field and extract
 * the correct valid/ambiguous flags from the parsed content.
 */

/**
 * Strip code fences from text, commonly used to wrap JSON responses
 * @param {string} text - Text that may contain ```json...``` blocks
 * @returns {string} - Cleaned text without code fences
 */
export function stripCodeFences(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
}

/**
 * Attempt to parse JSON from text, trying multiple approaches
 * @param {string} text - Text that may contain JSON
 * @returns {any|null} - Parsed JSON object or null if parsing fails
 */
export function tryParseJsonFromText(text) {
  if (!text || typeof text !== 'string') return null;
  
  // Approach 1: Direct JSON parse
  try { 
    return JSON.parse(text); 
  } catch {}
  
  // Approach 2: Extract from code fences and parse
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    try { 
      return JSON.parse(fenceMatch[1].trim()); 
    } catch {}
  }
  
  return null;
}

/**
 * Normalize a Dify response into a stable shape for the frontend.
 * 
 * This function:
 * 1. Extracts the raw text from the Dify response
 * 2. Attempts to parse JSON from that text (may be wrapped in code fences)
 * 3. Uses the parsed JSON as the authoritative source for flags and data
 * 4. Falls back to safe defaults only if no parsed content is available
 * 5. Never contradicts parsed JSON values with hardcoded defaults
 * 
 * @param {any} difyResponse - Raw response from Dify API
 * @returns {object} - Normalized response structure
 */
export function normalizeDifyResponse(difyResponse) {
  // Extract the raw text from various possible locations in the response
  const text = difyResponse?.answer ?? 
               difyResponse?.output ?? 
               difyResponse?.text ?? 
               '';

  // Try to parse structured JSON from the text
  const parsed = tryParseJsonFromText(text);
  const outputs = parsed && typeof parsed === 'object' ? parsed : {};

  // Extract clean answer text for display (without code fences)
  const answer = outputs?.answer ?? 
                 stripCodeFences(text) ?? 
                 text ?? 
                 '';

  // Flags: ALWAYS prefer parsed JSON values over defaults
  // Only fall back to heuristics if no parsed values exist
  let valid = false;
  let ambiguous = true;

  if (typeof outputs?.valid === 'boolean') {
    valid = outputs.valid;
  }

  if (typeof outputs?.ambiguous === 'boolean') {
    ambiguous = outputs.ambiguous;
  } else if (typeof outputs?.valid === 'boolean') {
    // If we have a valid flag but no ambiguous flag, infer ambiguous as opposite of valid
    ambiguous = !outputs.valid;
  }

  // Extract conversation ID from multiple possible locations
  const conversation_id = difyResponse?.conversation_id ?? 
                          difyResponse?.id ?? 
                          null;

  return {
    text,                      // Original raw string (may contain fences)
    answer,                    // Clean assistant text to display
    valid,
    isValid: valid,            // Mirror for compatibility
    ambiguous,
    conversation_id,
    outputs,                   // Parsed JSON from text (what the FE prefers)
    raw: { difyResponse }      // Keep original for debugging
  };
}

/**
 * Legacy compatibility function for existing code that may expect
 * the old structure. This maps the normalized response back to the
 * expected format but ensures flags come from parsed content.
 * 
 * @param {any} difyResponse - Raw response from Dify API
 * @returns {object} - Response in the expected legacy format
 */
export function normalizeDifyResponseLegacy(difyResponse) {
  const normalized = normalizeDifyResponse(difyResponse);
  
  return {
    text: normalized.answer,   // Use clean answer text
    valid: normalized.valid,
    ambiguous: normalized.ambiguous,
    extracted: {
      // Extract known fields from outputs for backward compatibility
      incomeMonthlyNet: normalized.outputs?.incomeMonthlyNet ?? null,
      ...normalized.outputs?.extracted
    },
    raw: normalized.raw
  };
}