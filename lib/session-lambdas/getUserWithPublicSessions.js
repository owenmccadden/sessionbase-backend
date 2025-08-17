const { createResponse, createErrorResponse } = require('./authUtils');
const { getUser } = require('./userUtils');
const { getSessionsByUser } = require('./dynamoUtils');

exports.main = async (event) => {
  const userId = event.pathParameters?.id;

  if (!userId) {
    return createErrorResponse(400, 'Missing user id');
  }

  try {
    // Get user metadata
    const user = await getUser(userId);
    
    if (!user) {
      return createErrorResponse(404, 'User not found');
    }

    // Get all public sessions for this user
    const sessionsResult = await getSessionsByUser(userId, { limit: 100 });
    
    // Filter to only public sessions
    const publicSessions = (sessionsResult.items || [])
      .filter(session => session.isPrivate === 'false')
      .map(session => ({
        sessionId: session.sessionId,
        title: session.title,
        summary: session.summary,
        tags: session.tags,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        views: session.views || 0,
        upvotes: session.upvotes || 0,
        downvotes: session.downvotes || 0,
        shares: session.shares || 0,
        messageCount: session.messageCount,
        modelName: session.modelName,
        sessionType: session.sessionType,
        tokenCount: session.tokenCount
      }));

    // Prepare user profile data (excluding sensitive information)
    const userProfile = {
      userId: user.userId,
      username: user.username,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt
    };

    const response = {
      user: userProfile,
      sessions: publicSessions,
      totalSessions: publicSessions.length
    };

    return createResponse(200, response);

  } catch (error) {
    console.error('Error in getUserWithPublicSessions:', error);
    return createErrorResponse(500, 'Error getting user data');
  }
};