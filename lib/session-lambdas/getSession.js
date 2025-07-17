
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getUserFromEvent, createResponse, createErrorResponse } = require('./authUtils');
const { getSessionMetadata } = require('./dynamoUtils');

const s3Client = new S3Client({});

exports.main = async (event) => {
  const sessionId = event.pathParameters?.id;

  if (!sessionId) {
    return createErrorResponse(400, 'Missing session id');
  }

  try {
    // Get session metadata from DynamoDB
    const sessionMetadata = await getSessionMetadata(sessionId);
    
    if (!sessionMetadata) {
      return createErrorResponse(404, 'Session not found');
    }

    // Check if session is private and if user has access
    const isPrivate = sessionMetadata.isPrivate === 'true';
    const ownerId = sessionMetadata.userId;

    console.log('Session privacy check:', {
      sessionId,
      isPrivate,
      storedOwnerId: ownerId,
    });

    if (isPrivate) {
      const user = getUserFromEvent(event);
      
      if (!user) {
        return createErrorResponse(401, 'Authentication required for private sessions');
      }
      
      console.log('User from JWT:', {
        userId: user.userId,
        username: user.username
      });

      // Convert both to strings for comparison to handle type mismatches
      const userIdStr = user.userId.toString();
      const ownerIdStr = ownerId ? ownerId.toString() : '';
      
      console.log('ID comparison:', {
        userIdStr,
        ownerIdStr,
        match: userIdStr === ownerIdStr
      });
      
      if (userIdStr !== ownerIdStr) {
        return createErrorResponse(403, `Access denied: You can only access your own private sessions`);
      }
    }

    // Get the session content from S3
    const s3Command = new GetObjectCommand({
      Bucket: process.env.SESSION_BUCKET_NAME,
      Key: sessionId,
    });

    const s3Response = await s3Client.send(s3Command);
    const bodyString = await s3Response.Body?.transformToString();
    
    // Determine content type based on stored metadata or content type
    const storedContentType = s3Response.ContentType;
    const dataFormat = s3Response.Metadata?.['data-format'];
    
    // Always return content as string - let the frontend session parser handle parsing
    const sessionContent = bodyString;
    
    // Return wrapped response with both metadata and content
    const response = {
      metadata: {
        sessionId: sessionMetadata.sessionId,
        userId: sessionMetadata.userId,
        username: sessionMetadata.username,
        avatarUrl: sessionMetadata.avatarUrl,
        title: sessionMetadata.title,
        summary: sessionMetadata.summary,
        tags: sessionMetadata.tags,
        isPrivate: isPrivate,
        views: sessionMetadata.views || 0,
        upvotes: sessionMetadata.upvotes || 0,
        downvotes: sessionMetadata.downvotes || 0,
        shares: sessionMetadata.shares || 0,
        messageCount: sessionMetadata.messageCount,
        tokenCount: sessionMetadata.tokenCount,
        modelName: sessionMetadata.modelName,
        createdAt: sessionMetadata.createdAt,
        updatedAt: sessionMetadata.updatedAt,
        contentType: storedContentType,
        dataFormat: dataFormat
      },
      data: sessionContent
    };
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      },
      body: JSON.stringify(response),
    };

  } catch (error) {
    console.error('Error in getSession:', error);
    
    if (error.name === 'NoSuchKey') {
      return createErrorResponse(404, 'Session content not found');
    }
    
    return createErrorResponse(500, 'Error getting session');
  }
};
