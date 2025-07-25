/**
 * Utility functions for handling JSONL (JSON Lines) data
 */

/**
 * Parse JSONL string into an array of objects
 * @param {string} jsonlString - The JSONL string to parse
 * @returns {Array} Array of parsed JSON objects
 */
function parseJsonl(jsonlString) {
  if (!jsonlString || jsonlString.trim() === '') {
    return [];
  }
  
  const lines = jsonlString.trim().split('\n');
  const results = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue; // Skip empty lines
    
    try {
      const parsed = JSON.parse(line);
      // Filter out summary lines that cause frontend UX issues
      if (parsed.type !== 'summary') {
        results.push(parsed);
      }
    } catch (error) {
      throw new Error(`Invalid JSON at line ${i + 1}: ${error.message}`);
    }
  }
  
  return results;
}

/**
 * Convert an array of objects to JSONL string
 * @param {Array} objects - Array of objects to convert
 * @returns {string} JSONL formatted string
 */
function toJsonl(objects) {
  if (!Array.isArray(objects)) {
    throw new Error('Input must be an array');
  }
  
  return objects.map(obj => JSON.stringify(obj)).join('\n');
}

/**
 * Decode Base64 string if it appears to be Base64 encoded
 * @param {string} str - The string to potentially decode
 * @returns {string} Decoded string or original string
 */
function decodeIfBase64(str) {
  try {
    // Check if string looks like Base64 (only contains Base64 characters)
    if (/^[A-Za-z0-9+/]*={0,2}$/.test(str) && str.length % 4 === 0) {
      const decoded = Buffer.from(str, 'base64').toString('utf8');
      // Verify the decoded string contains JSON-like characters
      if (decoded.includes('{') || decoded.includes('[')) {
        return decoded;
      }
    }
  } catch (error) {
    // If decoding fails, return original string
  }
  return str;
}

/**
 * Detect if data is Gemini CLI format
 * @param {Array} data - Parsed JSON array
 * @returns {boolean} True if data appears to be Gemini CLI format
 */
function isGeminiCliFormat(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }
  
  // Check if messages have Gemini CLI structure
  return data.some(msg => 
    msg.role && ['user', 'model'].includes(msg.role) && 
    msg.parts && Array.isArray(msg.parts) &&
    (msg.parts.some(part => part.text || part.functionCall || part.functionResponse))
  );
}

/**
 * Detect session type from parsed data
 * @param {Array|Object} data - Parsed session data
 * @returns {string} Session type: 'claude', 'gemini_cli', or 'q_chat'
 */
function detectSessionType(data) {
  // Check if it's Gemini CLI format (JSON array with role/parts structure)
  if (isGeminiCliFormat(data)) {
    return 'gemini_cli';
  }
  
  // Check if it's wrapped Gemini CLI format (from CLI)
  if (data.messages && Array.isArray(data.messages) && isGeminiCliFormat(data.messages)) {
    return 'gemini_cli';
  }
  
  // Check if platform is explicitly set to gemini-cli
  if (data.platform === 'gemini-cli') {
    return 'gemini_cli';
  }
  
  // Check if it's Claude format (JSONL or wrapped with rawMessages)
  if (Array.isArray(data)) {
    // Direct JSONL array - likely Claude
    if (data.some(item => item.type && ['text', 'tool_use', 'tool_result'].includes(item.type))) {
      return 'claude';
    }
  } else if (data.rawMessages && Array.isArray(data.rawMessages)) {
    // Claude Code wrapped format
    return 'claude';
  }
  
  // Default to q_chat for other JSON formats
  return 'q_chat';
}

/**
 * Parse request body that could be JSON, JSONL, or Gemini CLI format
 * @param {string} body - The request body (may be Base64 encoded)
 * @returns {Array|Object} Parsed data (array for JSONL/Gemini, object for JSON)
 */
function parseRequestBody(body) {
  if (!body || body.trim() === '') {
    return {};
  }
  
  // First, try to decode if it's Base64 encoded (API Gateway sometimes does this)
  const decodedBody = decodeIfBase64(body.trim());
  const trimmedBody = decodedBody.trim();
  
  // Try to detect if it's JSONL by checking for newlines and multiple JSON objects
  if (trimmedBody.includes('\n')) {
    try {
      return parseJsonl(trimmedBody);
    } catch (error) {
      // If JSONL parsing fails, try regular JSON parsing
      try {
        const parsed = JSON.parse(trimmedBody);
        // Check if it's Gemini CLI format (JSON array with role/parts structure)
        if (isGeminiCliFormat(parsed)) {
          return parsed;
        }
        // Check if it's Claude Code wrapped format with messages array
        if (parsed.messages && Array.isArray(parsed.messages)) {
          // Preserve metadata while extracting messages
          return {
            ...parsed,
            // Keep the messages as the main data but preserve other fields
            ...parsed.messages.length > 0 ? { rawMessages: parsed.messages } : {}
          };
        }
        return parsed;
      } catch (jsonError) {
        throw new Error(`Failed to parse as both JSONL and JSON. JSONL error: ${error.message}, JSON error: ${jsonError.message}`);
      }
    }
  } else {
    // Single line, try JSON first
    try {
      const parsed = JSON.parse(trimmedBody);
      // Check if it's Gemini CLI format (JSON array with role/parts structure)
      if (isGeminiCliFormat(parsed)) {
        return parsed;
      }
      // Check if it's Claude Code wrapped format with messages array
      if (parsed.messages && Array.isArray(parsed.messages)) {
        // Preserve metadata while extracting messages
        return {
          ...parsed,
          // Keep the messages as the main data but preserve other fields
          ...parsed.messages.length > 0 ? { rawMessages: parsed.messages } : {}
        };
      }
      return parsed;
    } catch (error) {
      // If JSON parsing fails and it's a single line, it might still be JSONL with one line
      try {
        const result = parseJsonl(trimmedBody);
        return result.length === 1 ? result[0] : result;
      } catch (jsonlError) {
        throw new Error(`Failed to parse as both JSON and JSONL. JSON error: ${error.message}, JSONL error: ${jsonlError.message}`);
      }
    }
  }
}

module.exports = {
  parseJsonl,
  toJsonl,
  parseRequestBody,
  decodeIfBase64,
  isGeminiCliFormat,
  detectSessionType
};
