const { getUserFromEvent, createResponse, createErrorResponse } = require('./authUtils');

exports.main = async (event) => {
  try {
    // Verify user authentication (should be JWT token from OAuth callback)
    const user = await getUserFromEvent(event);
    if (!user) {
      return createErrorResponse(401, 'Authentication required');
    }

    // Return user info - getUserFromEvent already gives us the user data
    const responseData = {
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
      message: 'User authenticated successfully'
    };

    return createResponse(200, responseData);

  } catch (error) {
    console.error('Error in /auth/me:', error);
    return createErrorResponse(500, 'Failed to get user information');
  }
};