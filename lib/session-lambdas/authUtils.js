const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const JWT_SECRET = process.env.JWT_SECRET;
const OAUTH_STATE_TABLE = process.env.OAUTH_STATE_TABLE_NAME;
const USER_METADATA_TABLE = process.env.USER_METADATA_TABLE_NAME;

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Generate a JWT token for a user
 */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.login,
      email: user.email,
      avatarUrl: user.avatar_url,
      provider: user.provider || 'github', // Default to github for backward compatibility
    },
    JWT_SECRET
    // No expiration - tokens never expire
  );
}


/**
 * Verify and decode a JWT token with detailed error info
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.log('Token verification failed:', error.message);
    return null;
  }
}


/**
 * Check if a token is expired without throwing
 * Since tokens no longer expire, this always returns false
 */
function isTokenExpired(token) {
  // Tokens never expire, but we still validate signature
  try {
    jwt.verify(token, JWT_SECRET);
    return false;
  } catch (error) {
    // Token is invalid (bad signature, malformed), not expired
    return false;
  }
}

/**
 * Get token info (no expiration since tokens never expire)
 */
function getTokenInfo(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded) return null;
    
    return {
      hasExpiration: false,
      isExpired: false,
      expiresAt: null,
      issuedAt: decoded.iat ? new Date(decoded.iat * 1000) : null,
      type: decoded.type || 'user',
    };
  } catch (error) {
    return null;
  }
}

/**
 * Extract user from Authorization header
 * Supports both JWT tokens and API keys
 */
async function getUserFromEvent(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  
  // Check if it's an API key (starts with sb_live_)
  if (token.startsWith('sb_live_')) {
    return await getUserByApiKey(token);
  }
  
  // Otherwise, treat as JWT token
  return verifyToken(token);
}

/**
 * Create a standardized API response
 */
function createResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Create error response
 */
function createErrorResponse(statusCode, message) {
  return createResponse(statusCode, { error: message });
}

/**
 * Generate cryptographically secure OAuth state
 */
function generateOAuthState() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Store OAuth state in DynamoDB with TTL
 */
async function storeOAuthState(state, metadata = {}) {
  const ttl = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
  
  const command = new PutCommand({
    TableName: OAUTH_STATE_TABLE,
    Item: {
      state,
      ttl,
      createdAt: new Date().toISOString(),
      ...metadata
    }
  });

  try {
    await docClient.send(command);
    return true;
  } catch (error) {
    console.error('Error storing OAuth state:', error);
    throw error;
  }
}

/**
 * Retrieve and validate OAuth state from DynamoDB
 */
async function validateOAuthState(state) {
  if (!state) {
    return null;
  }

  const command = new GetCommand({
    TableName: OAUTH_STATE_TABLE,
    Key: { state }
  });

  try {
    const response = await docClient.send(command);
    
    if (!response.Item) {
      console.log('OAuth state not found:', state);
      return null;
    }

    // Check if expired (TTL should handle this, but double-check)
    const now = Math.floor(Date.now() / 1000);
    if (response.Item.ttl < now) {
      console.log('OAuth state expired:', state);
      return null;
    }

    return response.Item;
  } catch (error) {
    console.error('Error validating OAuth state:', error);
    return null;
  }
}

/**
 * Delete OAuth state after successful validation
 */
async function deleteOAuthState(state) {
  const command = new DeleteCommand({
    TableName: OAUTH_STATE_TABLE,
    Key: { state }
  });

  try {
    await docClient.send(command);
    return true;
  } catch (error) {
    console.error('Error deleting OAuth state:', error);
    // Don't throw - this is cleanup, shouldn't fail the flow
    return false;
  }
}

/**
 * Generate a cryptographically secure API key in format: sb_live_<64-hex-chars>
 */
function generateApiKey() {
  const randomBytes = crypto.randomBytes(32); // 32 bytes = 256 bits
  const hexString = randomBytes.toString('hex'); // 64 hex characters
  return `sb_live_${hexString}`;
}

/**
 * Validate API key format
 */
function isValidApiKeyFormat(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }
  
  // Must start with sb_live_ and have 64 hex characters after
  const pattern = /^sb_live_[a-f0-9]{64}$/;
  return pattern.test(key);
}

/**
 * Get user by API key from database
 * Returns user object similar to JWT token payload
 */
async function getUserByApiKey(apiKey) {
  if (!isValidApiKeyFormat(apiKey)) {
    console.log('Invalid API key format:', apiKey?.substring(0, 16) + '...');
    return null;
  }

  // Query the UserMetadata table by API key
  // Since API key is not the primary key, we need to scan or create a GSI
  // For now, we'll use a scan (not efficient but works for initial implementation)
  const command = new QueryCommand({
    TableName: USER_METADATA_TABLE,
    IndexName: 'ApiKeyIndex', // We'll need to add this GSI
    KeyConditionExpression: 'apiKey = :apiKey',
    ExpressionAttributeValues: {
      ':apiKey': apiKey
    }
  });

  try {
    const response = await docClient.send(command);
    
    if (!response.Items || response.Items.length === 0) {
      console.log('API key not found in database');
      return null;
    }

    const user = response.Items[0];
    
    // Return user object in same format as JWT token payload
    return {
      userId: user.userId,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      provider: 'github', // Default for now
    };
  } catch (error) {
    console.error('Error looking up user by API key:', error);
    return null;
  }
}

/**
 * Rotate user's API key
 * Generates a new API key and updates the database
 */
async function rotateUserApiKey(userId) {
  const newApiKey = generateApiKey();
  const timestamp = new Date().toISOString();
  
  // Update user record with new API key
  const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
  const command = new UpdateCommand({
    TableName: USER_METADATA_TABLE,
    Key: { userId: userId.toString() },
    UpdateExpression: 'SET apiKey = :apiKey, apiKeyCreatedAt = :createdAt, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':apiKey': newApiKey,
      ':createdAt': timestamp,
      ':updatedAt': timestamp,
    },
    ReturnValues: 'ALL_NEW',
  });

  try {
    const response = await docClient.send(command);
    return {
      apiKey: newApiKey,
      createdAt: timestamp,
      user: response.Attributes
    };
  } catch (error) {
    console.error('Error rotating API key:', error);
    throw error;
  }
}

module.exports = {
  generateToken,
  verifyToken,
  isTokenExpired,
  getTokenInfo,
  getUserFromEvent,
  createResponse,
  createErrorResponse,
  generateOAuthState,
  storeOAuthState,
  validateOAuthState,
  deleteOAuthState,
  generateApiKey,
  isValidApiKeyFormat,
  getUserByApiKey,
  rotateUserApiKey,
};
