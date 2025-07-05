const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { verifyShareToken, getTokenInfo, createResponse, createErrorResponse } = require('./authUtils');

const s3Client = new S3Client({});

exports.main = async (event) => {
  try {
    const shareToken = event.pathParameters?.token;
    
    if (!shareToken) {
      return createErrorResponse(400, 'Missing share token');
    }

    // Verify the share token with detailed error handling
    const tokenResult = verifyShareToken(shareToken);
    
    // Handle specific error cases
    if (tokenResult && tokenResult.error) {
      if (tokenResult.error === 'expired') {
        return createErrorResponse(410, 'Share link has expired');
      }
      if (tokenResult.error === 'invalid') {
        return createErrorResponse(401, 'Invalid share link');
      }
      return createErrorResponse(401, tokenResult.message || 'Share link verification failed');
    }
    
    if (!tokenResult) {
      return createErrorResponse(401, 'Invalid or expired share token');
    }

    const { sessionId } = tokenResult;

    // Get token info for response headers
    const tokenInfo = getTokenInfo(shareToken);

    // Get the session data
    const command = new GetObjectCommand({
      Bucket: process.env.SESSION_BUCKET_NAME,
      Key: sessionId,
    });

    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString();
    
    // Get session metadata for additional info
    let sessionMetadata = null;
    try {
      const metadataCommand = new GetObjectCommand({
        Bucket: process.env.SESSION_BUCKET_NAME,
        Key: `metadata/${sessionId}.json`,
      });
      
      const metadataResponse = await s3Client.send(metadataCommand);
      const metadataBody = await metadataResponse.Body?.transformToString();
      sessionMetadata = JSON.parse(metadataBody);
    } catch (error) {
      console.log('No metadata found for shared session');
    }

    // Determine content type
    const storedContentType = response.ContentType;
    const dataFormat = response.Metadata?.['data-format'];
    
    let responseContentType = 'application/json';
    if (storedContentType === 'application/jsonl' || dataFormat === 'jsonl') {
      responseContentType = 'application/jsonl';
    }
    
    // Build response headers with token info
    const responseHeaders = {
      'Content-Type': responseContentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'X-Session-Shared': 'true',
      'X-Session-Owner': sessionMetadata?.ownerUsername || response.Metadata?.['owner-username'] || '',
      'X-Session-Created': sessionMetadata?.createdAt || response.Metadata?.['created-at'] || '',
    };

    // Add token expiration info to headers
    if (tokenInfo) {
      responseHeaders['X-Share-Has-Expiration'] = tokenInfo.hasExpiration.toString();
      if (tokenInfo.expiresAt) {
        responseHeaders['X-Share-Expires-At'] = tokenInfo.expiresAt.toISOString();
      }
      if (tokenInfo.issuedAt) {
        responseHeaders['X-Share-Created-At'] = tokenInfo.issuedAt.toISOString();
      }
    }
    
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: body || '',
    };

  } catch (error) {
    console.error('Error accessing shared session:', error);
    
    if (error.name === 'NoSuchKey') {
      return createErrorResponse(404, 'Shared session not found');
    }
    
    return createErrorResponse(500, 'Error accessing shared session');
  }
};
