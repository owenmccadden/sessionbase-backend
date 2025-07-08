const { getUserFromEvent, generateShareToken, getTokenInfo, createResponse, createErrorResponse } = require('./authUtils');
const { getSessionMetadata, userOwnsSession } = require('./dynamoUtils');

exports.main = async (event) => {
  try {
    const sessionId = event.pathParameters?.id;
    
    if (!sessionId) {
      return createErrorResponse(400, 'Missing session id');
    }

    // Require authentication
    const user = getUserFromEvent(event);
    if (!user) {
      return createErrorResponse(401, 'Authentication required');
    }

    // Get session metadata from DynamoDB
    const sessionMetadata = await getSessionMetadata(sessionId);
    
    if (!sessionMetadata) {
      return createErrorResponse(404, 'Session not found');
    }

    // Verify the session is private
    if (sessionMetadata.isPrivate !== 'true') {
      return createErrorResponse(400, 'Only private sessions can be shared via links');
    }

    // Verify ownership
    const ownsSession = await userOwnsSession(sessionId, user.userId);
    if (!ownsSession) {
      return createErrorResponse(403, 'You can only create share links for your own sessions');
    }

    // Parse query parameters for share options
    const queryParams = event.queryStringParameters || {};
    const expiresIn = queryParams.expires || '30d'; // Default 30 days
    
    // Validate expiration options
    const validExpirations = ['7d', '30d', '90d', '1y', 'never'];
    if (!validExpirations.includes(expiresIn)) {
      return createErrorResponse(400, `Invalid expiration option. Valid options: ${validExpirations.join(', ')}`);
    }

    console.log('Creating share token:', {
      sessionId,
      ownerId: user.userId,
      expiresIn,
      isNeverExpiring: expiresIn === 'never'
    });

    // Generate share token
    const shareToken = generateShareToken(sessionId, user.userId, expiresIn);
    
    // Get token info for response
    const tokenInfo = getTokenInfo(shareToken);
    
    // Construct share URL
    const baseUrl = `https://${event.requestContext.domainName}`;
    const shareUrl = `${baseUrl}/shared/${shareToken}`;

    const responseData = {
      shareToken,
      shareUrl,
      sessionId,
      expiresIn,
      hasExpiration: tokenInfo?.hasExpiration || false,
      createdAt: new Date().toISOString(),
    };

    // Add expiration date if token has one
    if (tokenInfo?.expiresAt) {
      responseData.expiresAt = tokenInfo.expiresAt.toISOString();
    }

    return createResponse(200, responseData);

  } catch (error) {
    console.error('Error creating share link:', error);
    return createErrorResponse(500, 'Error creating share link');
  }
};
