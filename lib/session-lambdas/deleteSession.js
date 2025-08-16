const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getUserFromEvent, createResponse, createErrorResponse } = require('./authUtils');
const { deleteSessionMetadata, userOwnsSession } = require('./dynamoUtils');

const s3Client = new S3Client({});
const BLOCKED_USERS = (process.env.BLOCKED_USER_IDS || '').split(',').filter(Boolean);

exports.main = async (event) => {
  const sessionId = event.pathParameters?.id;

  if (!sessionId) {
    return createErrorResponse(400, 'Missing session id');
  }

  try {
    // Authentication required for deleting sessions
    const user = getUserFromEvent(event);
    
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
      return createErrorResponse(403, 'You can only delete your own sessions');
    }

    console.log('Deleting session:', {
      sessionId,
      userId: user.userId
    });

    // Delete the session content from S3
    const s3Command = new DeleteObjectCommand({
      Bucket: process.env.SESSION_BUCKET_NAME,
      Key: sessionId,
    });

    await s3Client.send(s3Command);
    console.log(`Session content deleted from S3: ${sessionId}`);

    // Delete the session metadata from DynamoDB
    await deleteSessionMetadata(sessionId);

    return createResponse(200, {
      message: 'Session deleted successfully',
      sessionId: sessionId
    });

  } catch (error) {
    console.error('Error in deleteSession:', error);
    return createErrorResponse(500, 'Error deleting session');
  }
};