const { createResponse, createErrorResponse } = require('./authUtils');
const { getPublicSessions } = require('./dynamoUtils');

exports.main = async (event) => {
  try {
    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit) || 20;
    const lastEvaluatedKey = queryParams.lastEvaluatedKey ? 
      JSON.parse(decodeURIComponent(queryParams.lastEvaluatedKey)) : null;

    // Validate limit - more restrictive since we're using scan
    if (limit > 25) {
      return createErrorResponse(400, 'Limit cannot exceed 25 for public discovery');
    }

    console.log('Discovering public sessions:', {
      limit,
      hasLastKey: !!lastEvaluatedKey
    });

    // Get public sessions from DynamoDB using scan
    // Note: This is less efficient than a query but necessary without a proper GSI
    const result = await getPublicSessions({
      limit: Math.min(limit * 2, 50), // Scan more to account for filtering and sorting
      lastEvaluatedKey
    });

    // Take only the requested number after sorting
    const sessions = result.items.slice(0, limit).map(session => ({
      sessionId: session.sessionId,
      userId: session.userId,
      username: session.username, // Show the creator's username for public sessions
      title: session.title,
      summary: session.summary,
      tags: session.tags,
      createdAt: session.createdAt,
      views: session.views || 0,
      upvotes: session.upvotes || 0,
      downvotes: session.downvotes || 0,
      shares: session.shares || 0,
      tokenCount: session.tokenCount,
      messageCount: session.messageCount,
      modelName: session.modelName,
    }));

    const response = {
      sessions,
      count: sessions.length,
      hasMore: !!result.lastEvaluatedKey,
      note: 'Public session discovery uses table scan - consider caching for production use'
    };

    // Include pagination token if there are more results
    if (result.lastEvaluatedKey) {
      response.nextToken = encodeURIComponent(JSON.stringify(result.lastEvaluatedKey));
    }

    return createResponse(200, response);

  } catch (error) {
    console.error('Error in discoverSessions:', error);
    return createErrorResponse(500, 'Error discovering sessions');
  }
};
