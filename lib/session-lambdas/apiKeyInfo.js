const { getUserFromEvent, createResponse, createErrorResponse } = require('./authUtils');
const { getUser } = require('./userUtils');

exports.main = async (event) => {
  try {
    // Verify user authentication
    const authUser = await getUserFromEvent(event);
    if (!authUser) {
      return createErrorResponse(401, 'Authentication required');
    }

    // Get full user data from database
    const user = await getUser(authUser.userId);
    if (!user) {
      return createErrorResponse(404, 'User not found');
    }

    // Return full API key info - frontend will handle masking for display
    return createResponse(200, {
      apiKey: user.apiKey,
      apiKeyCreatedAt: user.apiKeyCreatedAt,
      hasApiKey: !!user.apiKey
    });

  } catch (error) {
    console.error('Error getting API key info:', error);
    return createErrorResponse(500, 'Failed to get API key info');
  }
};