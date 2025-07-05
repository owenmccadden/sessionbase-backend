const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const { parseRequestBody, toJsonl } = require('./jsonlUtils');
const { getUserFromEvent, createResponse, createErrorResponse } = require('./authUtils');

const s3Client = new S3Client({});

exports.main = async (event) => {
  try {
    // Handle Base64 encoded bodies from API Gateway
    let requestBody = event.body || '{}';
    
    // If API Gateway indicates the body is Base64 encoded, decode it
    if (event.isBase64Encoded && requestBody) {
      requestBody = Buffer.from(requestBody, 'base64').toString('utf8');
    }
    
    // Parse the request body (handles both JSON and JSONL)
    const data = parseRequestBody(requestBody);
    const id = uuidv4(); // Always generate a UUID

    // Check if user is authenticated
    const user = getUserFromEvent(event);
    
    // Check if they're trying to create a private session
    const requestedPrivate = data.isPrivate === true;
    
    // If they want a private session but aren't authenticated, reject the request
    if (requestedPrivate && !user) {
      return createErrorResponse(401, 'Authentication required to create private sessions');
    }
    
    // Determine if session should be private (only if authenticated AND requested)
    const isPrivate = requestedPrivate && user !== null;
    
    console.log('Session creation:', {
      requestedPrivate,
      userAuthenticated: !!user,
      finalIsPrivate: isPrivate,
      userId: user?.userId
    });
    
    // Create session metadata
    const sessionMetadata = {
      id,
      createdAt: new Date().toISOString(),
      isPrivate,
      ownerId: user?.userId || null,
      ownerUsername: user?.username || null,
    };

    // Determine the storage format based on input type
    let bodyToStore;
    let contentType = 'application/json';
    
    if (Array.isArray(data)) {
      // If data is an array (from JSONL), store as JSONL
      bodyToStore = toJsonl(data);
      contentType = 'application/jsonl';
    } else {
      // If data is an object (from JSON), store as JSON
      // Remove isPrivate from the stored data as it's in metadata
      const { isPrivate: _, ...dataToStore } = data;
      bodyToStore = JSON.stringify(dataToStore);
      contentType = 'application/json';
    }

    // Store the session data
    const command = new PutObjectCommand({
      Bucket: process.env.SESSION_BUCKET_NAME,
      Key: id,
      Body: bodyToStore,
      ContentType: contentType,
      Metadata: {
        'data-format': Array.isArray(data) ? 'jsonl' : 'json',
        'is-private': isPrivate.toString(),
        'owner-id': user?.userId?.toString() || '',
        'owner-username': user?.username || '',
        'created-at': sessionMetadata.createdAt,
      }
    });

    await s3Client.send(command);

    // Store session metadata separately for easier querying
    const metadataCommand = new PutObjectCommand({
      Bucket: process.env.SESSION_BUCKET_NAME,
      Key: `metadata/${id}.json`,
      Body: JSON.stringify(sessionMetadata),
      ContentType: 'application/json',
    });

    await s3Client.send(metadataCommand);

    return createResponse(201, {
      message: 'Session created',
      id: id,
      format: Array.isArray(data) ? 'jsonl' : 'json',
      recordCount: Array.isArray(data) ? data.length : 1,
      isPrivate,
      owner: user ? {
        id: user.userId,
        username: user.username,
      } : null,
    });

  } catch (error) {
    console.error('Error in createSession:', error);
    return createErrorResponse(400, `Error creating session: ${error.message}`);
  }
};
