
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getUserFromEvent, createResponse, createErrorResponse } = require('./authUtils');

const s3Client = new S3Client({});

exports.main = async (event) => {
  const id = event.pathParameters?.id;

  if (!id) {
    return createErrorResponse(400, 'Missing session id');
  }

  try {
    // First, get session metadata to check privacy settings
    const metadataCommand = new GetObjectCommand({
      Bucket: process.env.SESSION_BUCKET_NAME,
      Key: `metadata/${id}.json`,
    });

    let sessionMetadata = null;
    try {
      const metadataResponse = await s3Client.send(metadataCommand);
      const metadataBody = await metadataResponse.Body?.transformToString();
      sessionMetadata = JSON.parse(metadataBody);
    } catch (metadataError) {
      // If no metadata exists, try to get from object metadata (backward compatibility)
      console.log('No separate metadata found, checking object metadata');
    }

    // Get the main session data
    const command = new GetObjectCommand({
      Bucket: process.env.SESSION_BUCKET_NAME,
      Key: id,
    });

    const response = await s3Client.send(command);
    
    // Check if session is private and if user has access
    const isPrivate = sessionMetadata?.isPrivate || 
                     response.Metadata?.['is-private'] === 'true';
    const ownerId = sessionMetadata?.ownerId || 
                   response.Metadata?.['owner-id'];

    console.log('Session privacy check:', {
      sessionId: id,
      isPrivate,
      storedOwnerId: ownerId,
      storedOwnerIdType: typeof ownerId
    });

    if (isPrivate) {
      const user = getUserFromEvent(event);
      
      if (!user) {
        return createErrorResponse(401, 'Authentication required for private sessions');
      }
      
      console.log('User from JWT:', {
        userId: user.userId,
        userIdType: typeof user.userId,
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
        return createErrorResponse(403, `Access denied: You can only access your own private sessions. User: ${userIdStr}, Owner: ${ownerIdStr}`);
      }
    }

    const body = await response.Body?.transformToString();
    
    // Determine content type based on stored metadata or content type
    const storedContentType = response.ContentType;
    const dataFormat = response.Metadata?.['data-format'];
    
    let responseContentType = 'application/json'; // default
    if (storedContentType === 'application/jsonl' || dataFormat === 'jsonl') {
      responseContentType = 'application/jsonl';
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': responseContentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'X-Session-Private': isPrivate.toString(),
        'X-Session-Owner': response.Metadata?.['owner-username'] || '',
      },
      body: body || '',
    };

  } catch (error) {
    console.error('Error in getSession:', error);
    
    if (error.name === 'NoSuchKey') {
      return createErrorResponse(404, 'Session not found');
    }
    
    return createErrorResponse(500, 'Error getting session');
  }
};
