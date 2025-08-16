const { getUserFromEvent, createResponse, createErrorResponse } = require('./authUtils');
const { getSessionMetadata, updateSessionMetadata, userOwnsSession } = require('./dynamoUtils');

const BLOCKED_USERS = (process.env.BLOCKED_USER_IDS || '').split(',').filter(Boolean);

exports.main = async (event) => {
  const sessionId = event.pathParameters?.id;

  if (!sessionId) {
    return createErrorResponse(400, 'Missing session id');
  }

  try {
    // Authentication required for updating metadata
    const user = await getUserFromEvent(event);
    
    if (!user) {
      return createErrorResponse(401, 'Authentication required');
    }

    // Check if user is blocked
    if (BLOCKED_USERS.includes(user.userId.toString())) {
      return createErrorResponse(429, 'Rate limit exceeded');
    }

    // Check if user owns the session
    const ownsSession = await userOwnsSession(sessionId, user.userId);
    
    if (!ownsSession) {
      return createErrorResponse(403, 'You can only update your own sessions');
    }

    // Parse request body
    let requestBody = event.body || '{}';
    
    if (event.isBase64Encoded && requestBody) {
      requestBody = Buffer.from(requestBody, 'base64').toString('utf8');
    }

    const updates = JSON.parse(requestBody);

    // Validate and sanitize updates
    const allowedFields = ['title', 'summary', 'tags', 'isPrivate'];
    const sanitizedUpdates = {};

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        if (key === 'tags' && value !== null) {
          // Ensure tags is an array
          sanitizedUpdates[key] = Array.isArray(value) ? value : [value];
        } else if (key === 'isPrivate') {
          // Ensure isPrivate is a string
          sanitizedUpdates[key] = String(value);
        } else {
          sanitizedUpdates[key] = value;
        }
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return createErrorResponse(400, 'No valid fields to update');
    }

    console.log('Updating session metadata:', {
      sessionId,
      userId: user.userId,
      updates: sanitizedUpdates
    });

    // Update the session metadata
    const updatedMetadata = await updateSessionMetadata(sessionId, sanitizedUpdates);

    // Transform response to match expected format
    const response = {
      sessionId: updatedMetadata.sessionId,
      title: updatedMetadata.title,
      summary: updatedMetadata.summary,
      tags: updatedMetadata.tags,
      isPrivate: updatedMetadata.isPrivate,
      tokenCount: updatedMetadata.tokenCount,
      messageCount: updatedMetadata.messageCount,
      modelName: updatedMetadata.modelName,
      updatedAt: updatedMetadata.updatedAt,
    };

    return createResponse(200, {
      message: 'Session metadata updated successfully',
      metadata: response
    });

  } catch (error) {
    console.error('Error in updateSessionMetadata:', error);
    return createErrorResponse(500, 'Error updating session metadata');
  }
};
