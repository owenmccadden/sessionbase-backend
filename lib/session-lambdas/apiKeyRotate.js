const { getUserFromEvent, createResponse, createErrorResponse, rotateUserApiKey } = require('./authUtils');

exports.main = async (event) => {
  try {
    // Verify user authentication
    const user = await getUserFromEvent(event);
    if (!user) {
      return createErrorResponse(401, 'Authentication required');
    }

    // Rotate API key for the user
    const result = await rotateUserApiKey(user.userId);
    
    return createResponse(200, {
      apiKey: result.apiKey,
      createdAt: result.createdAt,
      message: 'API key rotated successfully'
    });

  } catch (error) {
    console.error('Error rotating API key:', error);
    return createErrorResponse(500, 'Failed to rotate API key');
  }
};