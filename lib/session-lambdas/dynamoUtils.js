const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand 
} = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.SESSION_METADATA_TABLE_NAME;

/**
 * Create a new session metadata record
 * @param {Object} sessionData - Session metadata object
 * @returns {Promise<Object>} - Created session metadata
 */
async function createSessionMetadata(sessionData) {
  const timestamp = new Date().toISOString();
  
  const sessionMetadata = {
    sessionId: sessionData.sessionId,
    userId: sessionData.userId.toString(), // Ensure userId is always a string for DynamoDB GSI
    username: sessionData.username || null,
    avatarUrl: sessionData.avatarUrl || null,
    createdAt: timestamp,
    updatedAt: timestamp,
    isPrivate: sessionData.isPrivate ? 'true' : 'false', // Store as string for GSI
    title: sessionData.title || null,
    summary: sessionData.summary || null,
    tags: sessionData.tags || null, // DynamoDB Set or null
    tokenCount: sessionData.tokenCount || null,
    messageCount: sessionData.messageCount || null,
    modelName: sessionData.modelName || null,
    views: 0,
    upvotes: 0,
    downvotes: 0,
    shares: 0,
  };

  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: sessionMetadata,
    ConditionExpression: 'attribute_not_exists(sessionId)', // Prevent overwrites
  });

  try {
    await docClient.send(command);
    return sessionMetadata;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new Error('Session already exists');
    }
    throw error;
  }
}

/**
 * Get session metadata by session ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object|null>} - Session metadata or null if not found
 */
async function getSessionMetadata(sessionId) {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: { sessionId },
  });

  try {
    const response = await docClient.send(command);
    return response.Item || null;
  } catch (error) {
    console.error('Error getting session metadata:', error);
    throw error;
  }
}

/**
 * Update session metadata
 * @param {string} sessionId - Session ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated session metadata
 */
async function updateSessionMetadata(sessionId, updates) {
  const timestamp = new Date().toISOString();
  
  // Build update expression dynamically
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  // Always update the updatedAt timestamp
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = timestamp;
  
  // Add other updates
  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'sessionId' && key !== 'createdAt') { // Don't allow updating these
      updateExpressions.push(`#${key} = :${key}`);
      expressionAttributeNames[`#${key}`] = key;
      expressionAttributeValues[`:${key}`] = value;
    }
  });

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { sessionId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  });

  try {
    const response = await docClient.send(command);
    return response.Attributes;
  } catch (error) {
    console.error('Error updating session metadata:', error);
    throw error;
  }
}

/**
 * Increment a counter field (views, upvotes, downvotes, shares)
 * @param {string} sessionId - Session ID
 * @param {string} counterField - Field to increment ('views', 'upvotes', 'downvotes', 'shares')
 * @param {number} incrementBy - Amount to increment by (default: 1)
 * @returns {Promise<number>} - New counter value
 */
async function incrementCounter(sessionId, counterField, incrementBy = 1) {
  const validCounters = ['views', 'upvotes', 'downvotes', 'shares'];
  if (!validCounters.includes(counterField)) {
    throw new Error(`Invalid counter field: ${counterField}`);
  }

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { sessionId },
    UpdateExpression: `ADD #counter :increment SET #updatedAt = :updatedAt`,
    ExpressionAttributeNames: {
      '#counter': counterField,
      '#updatedAt': 'updatedAt',
    },
    ExpressionAttributeValues: {
      ':increment': incrementBy,
      ':updatedAt': new Date().toISOString(),
    },
    ReturnValues: 'ALL_NEW',
  });

  try {
    const response = await docClient.send(command);
    return response.Attributes[counterField];
  } catch (error) {
    console.error(`Error incrementing ${counterField}:`, error);
    throw error;
  }
}

/**
 * Get sessions by user ID
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Array of session metadata
 */
async function getSessionsByUser(userId, options = {}) {
  const { limit = 50, lastEvaluatedKey = null } = options;

  // Validate userId
  if (!userId || userId === 'null' || userId === 'undefined') {
    console.error('Invalid userId provided to getSessionsByUser:', { userId, type: typeof userId });
    throw new Error('Valid userId is required');
  }

  console.log('Querying sessions for userId:', { userId, type: typeof userId, limit });

  const queryParams = {
    TableName: TABLE_NAME,
    IndexName: 'UserIndex',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId.toString(), // Ensure it's a string
    },
    ScanIndexForward: false, // Sort by createdAt descending (newest first)
    Limit: limit,
  };

  // Only add ExclusiveStartKey if lastEvaluatedKey is not null/undefined
  if (lastEvaluatedKey) {
    queryParams.ExclusiveStartKey = lastEvaluatedKey;
  }

  const command = new QueryCommand(queryParams);

  try {
    const response = await docClient.send(command);
    console.log('DynamoDB query successful:', { 
      itemCount: response.Items?.length || 0,
      hasMore: !!response.LastEvaluatedKey 
    });
    
    return {
      items: response.Items || [],
      lastEvaluatedKey: response.LastEvaluatedKey,
    };
  } catch (error) {
    console.error('Error getting sessions by user:', error);
    console.error('Query params were:', queryParams);
    throw error;
  }
}

/**
 * Get public sessions (for discovery)
 * Uses scan with filter since we removed the problematic low-cardinality GSI
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Array of public session metadata
 */
async function getPublicSessions(options = {}) {
  const { limit = 50, lastEvaluatedKey = null, search = '' } = options;

  const scanParams = {
    TableName: TABLE_NAME,
    FilterExpression: 'isPrivate = :isPrivate',
    ExpressionAttributeValues: {
      ':isPrivate': 'false',
    },
    Limit: limit,
  };

  // Add search filtering if search term is provided
  if (search && search.trim()) {
    const searchLower = search.toLowerCase().trim();
    const searchTerms = searchLower.split(/\s+/).filter(term => term.length > 0);
    
    if (searchTerms.length > 0) {
      // Build filter expression for search across title, summary, and tags
      const searchConditions = [];
      const attributeNames = {
        '#title': 'title',
        '#summary': 'summary',
        '#tags': 'tags'
      };
      const attributeValues = { ':isPrivate': 'false' };
      
      searchTerms.forEach((term, index) => {
        const termKey = `:searchTerm${index}`;
        attributeValues[termKey] = term;
        
        // Search in title, summary, and tags (if they exist)
        const titleCondition = `contains(#title, ${termKey})`;
        const summaryCondition = `contains(#summary, ${termKey})`;
        const tagsCondition = `contains(#tags, ${termKey})`;
        
        searchConditions.push(`${titleCondition} OR ${summaryCondition} OR ${tagsCondition}`);
      });
      
      // Combine all search conditions (all terms must match at least one field)
      if (searchConditions.length === 1) {
        scanParams.FilterExpression = `isPrivate = :isPrivate AND (${searchConditions[0]})`;
      } else {
        const searchFilter = searchConditions.map(condition => `(${condition})`).join(' AND ');
        scanParams.FilterExpression = `isPrivate = :isPrivate AND ${searchFilter}`;
      }
      scanParams.ExpressionAttributeNames = attributeNames;
      scanParams.ExpressionAttributeValues = attributeValues;
    }
  }

  // Only add ExclusiveStartKey if lastEvaluatedKey is not null/undefined
  if (lastEvaluatedKey) {
    scanParams.ExclusiveStartKey = lastEvaluatedKey;
  }

  const command = new ScanCommand(scanParams);

  try {
    const response = await docClient.send(command);
    
    // Apply additional client-side filtering for more flexible search
    let filteredItems = response.Items || [];
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      filteredItems = filteredItems.filter(item => {
        const title = (item.title || '').toLowerCase();
        const summary = (item.summary || '').toLowerCase();
        const tags = Array.isArray(item.tags) ? item.tags.join(' ').toLowerCase() : '';
        
        const searchText = `${title} ${summary} ${tags}`;
        return searchText.includes(searchLower);
      });
    }
    
    return {
      items: filteredItems,
      lastEvaluatedKey: response.LastEvaluatedKey,
    };
  } catch (error) {
    console.error('Error getting public sessions:', error);
    throw error;
  }
}

/**
 * Delete a session metadata record
 * @param {string} sessionId - Session ID
 * @returns {Promise<void>}
 */
async function deleteSessionMetadata(sessionId) {
  const command = new DeleteCommand({
    TableName: TABLE_NAME,
    Key: {
      sessionId: sessionId,
    },
  });

  try {
    await docClient.send(command);
    console.log(`Session metadata deleted: ${sessionId}`);
  } catch (error) {
    console.error('Error deleting session metadata:', error);
    throw error;
  }
}

/**
 * Check if user owns a session
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - True if user owns the session
 */
async function userOwnsSession(sessionId, userId) {
  const metadata = await getSessionMetadata(sessionId);
  // Convert both to strings for comparison since userId is stored as string in DynamoDB
  return metadata && metadata.userId === userId.toString();
}

module.exports = {
  createSessionMetadata,
  getSessionMetadata,
  updateSessionMetadata,
  deleteSessionMetadata,
  incrementCounter,
  getSessionsByUser,
  getPublicSessions,
  userOwnsSession,
};
