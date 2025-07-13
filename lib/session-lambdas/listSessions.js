const { getUserFromEvent, createResponse, createErrorResponse } = require('./authUtils');
const { getSessionsByUser } = require('./dynamoUtils');

exports.main = async (event) => {
  try {
    // Authentication required for listing user sessions
    const user = getUserFromEvent(event);
    
    console.log('User from JWT:', { 
      user, 
      hasUser: !!user,
      userId: user?.userId,
      userIdType: typeof user?.userId,
      username: user?.username 
    });
    
    if (!user) {
      return createErrorResponse(401, 'Authentication required');
    }

    if (!user.userId) {
      console.error('User object missing userId:', user);
      return createErrorResponse(400, 'Invalid user token - missing userId');
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit) || 50;
    const lastEvaluatedKey = queryParams.lastEvaluatedKey ? 
      JSON.parse(decodeURIComponent(queryParams.lastEvaluatedKey)) : null;

    // Validate limit
    if (limit > 100) {
      return createErrorResponse(400, 'Limit cannot exceed 100');
    }

    console.log('Listing sessions for user:', {
      userId: user.userId,
      username: user.username,
      limit,
      hasLastKey: !!lastEvaluatedKey
    });

    // Get user's sessions from DynamoDB
    const result = await getSessionsByUser(user.userId, {
      limit,
      lastEvaluatedKey
    });

    // Transform the response to include only necessary fields
    const sessions = result.items.map(session => ({
      sessionId: session.sessionId,
      userId: session.userId,
      username: session.username,
      avatarUrl: session.avatarUrl,
      title: session.title,
      summary: session.summary,
      tags: session.tags,
      isPrivate: session.isPrivate === 'true',
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
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
    };

    // Include pagination token if there are more results
    if (result.lastEvaluatedKey) {
      response.nextToken = encodeURIComponent(JSON.stringify(result.lastEvaluatedKey));
    }

    return createResponse(200, response);

  } catch (error) {
    console.error('Error in listSessions:', error);
    return createErrorResponse(500, 'Error retrieving sessions');
  }
};
