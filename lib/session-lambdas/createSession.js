const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4, v5: uuidv5, validate: uuidValidate } = require('uuid');
const { parseRequestBody, toJsonl, detectSessionType } = require('./jsonlUtils');
const { getUserFromEvent, createResponse, createErrorResponse } = require('./authUtils');
const { createSessionMetadata, getSessionMetadata, updateSessionMetadata } = require('./dynamoUtils');

const s3Client = new S3Client({});
const BLOCKED_USERS = (process.env.BLOCKED_USER_IDS || '').split(',').filter(Boolean);

// Namespace UUID for SessionBase Gemini sessions (deterministic UUID generation)
const GEMINI_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

exports.main = async (event) => {
  try {
    // Authentication is now required for all session creation
    const user = await getUserFromEvent(event);
    
    if (!user) {
      return createErrorResponse(401, 'Authentication required to create sessions');
    }

    // Check if user is blocked
    if (BLOCKED_USERS.includes(user.userId.toString())) {
      return createErrorResponse(429, 'Rate limit exceeded');
    }

    // Handle Base64 encoded bodies from API Gateway
    let requestBody = event.body || '{}';
    
    // If API Gateway indicates the body is Base64 encoded, decode it
    if (event.isBase64Encoded && requestBody) {
      requestBody = Buffer.from(requestBody, 'base64').toString('utf8');
    }
    
    // Parse the request body (handles both JSON and JSONL)
    const data = parseRequestBody(requestBody);
    
    // Detect session type (claude, gemini_cli, q_chat)
    const sessionType = detectSessionType(data);
    
    // Generate sessionId based on platform
    let sessionId;
    
    if (data.sessionId && uuidValidate(data.sessionId)) {
      // Claude Code, Q-Chat, and Codex provide their own session IDs
      sessionId = data.sessionId;
    } else if (data.platform === 'gemini-cli' && data.hashDir && data.tag) {
      // Generate deterministic UUID for Gemini sessions using hashDir + tag + userId
      const input = data.tag === 'default' 
        ? `${data.hashDir}-default-${user.userId}`
        : `${data.hashDir}-${data.tag}-${user.userId}`;
      sessionId = uuidv5(input, GEMINI_NAMESPACE);
      
      console.log('Generated Gemini session ID:', {
        hashDir: data.hashDir,
        tag: data.tag,
        userId: user.userId,
        sessionId
      });
    } else {
      // Fallback to random UUID
      sessionId = uuidv4();
    }

    // Determine if session should be private (default to false if not specified)
    const isPrivate = data.isPrivate === true;
    
    console.log('Session creation:', {
      sessionId,
      userId: user.userId,
      username: user.username,
      isPrivate,
      sessionType
    });

    // Extract metadata from the request
    const {
      title,
      summary,
      tags,
      tokenCount,
      messageCount,
      modelName,
      isPrivate: _, // Remove from content data
      sessionId: __, // Remove sessionId from content data
      hashDir: ___, // Remove Gemini hashDir from content data
      tag: ____, // Remove Gemini tag from content data
      cwd,
      platform,
      ...contentData
    } = data;

    // Determine the storage format based on input type
    let bodyToStore;
    let contentType = 'application/json';
    
    if (Array.isArray(data)) {
      // If data is an array (from JSONL), filter out summary lines and store as JSONL
      const filteredData = data.filter(item => item.type !== 'summary');
      bodyToStore = toJsonl(filteredData);
      contentType = 'application/jsonl';
    } else if (data.rawMessages && Array.isArray(data.rawMessages)) {
      // If data has rawMessages (Claude Code wrapped format), filter out summary lines and store as JSONL
      const filteredMessages = data.rawMessages.filter(item => item.type !== 'summary');
      bodyToStore = toJsonl(filteredMessages);
      contentType = 'application/jsonl';
    } else {
      // If data is an object (from JSON), store as JSON
      bodyToStore = JSON.stringify(contentData);
      contentType = 'application/json';
    }

    // Store the session content in S3
    const s3Command = new PutObjectCommand({
      Bucket: process.env.SESSION_BUCKET_NAME,
      Key: sessionId,
      Body: bodyToStore,
      ContentType: contentType,
      Metadata: {
        'data-format': Array.isArray(data) ? 'jsonl' : 'json',
        'session-id': sessionId,
        'session-type': sessionType,
        ...(cwd && { 'cwd': cwd }),
        ...(platform && { 'platform': platform })
      }
    });

    await s3Client.send(s3Command);

    // Check if session already exists (for upsert behavior)
    // For Claude Code, Q-Chat, and Codex, only check if they provided a sessionId
    // For Gemini, always check since we generate the sessionId server-side
    const shouldCheckExisting = data.sessionId || (data.platform === 'gemini-cli' && data.hashDir && data.tag);
    const existingSession = shouldCheckExisting ? await getSessionMetadata(sessionId) : null;
    let sessionMetadata;

    if (existingSession) {
      // Verify user owns the existing session
      if (existingSession.userId !== user.userId.toString()) {
        return createErrorResponse(403, 'Cannot update session owned by another user');
      }

      // Merge tags with existing tags
      const existingTags = existingSession.tags || [];
      const newTags = tags ? (Array.isArray(tags) ? tags : [tags]) : [];
      const mergedTags = [...new Set([...existingTags, ...newTags])]; // Dedupe with Set

      // Update existing session - only update fields that are provided
      const updates = {};
      if (title !== undefined) updates.title = title || null;
      if (summary !== undefined) updates.summary = summary || null;
      if (tags !== undefined) updates.tags = mergedTags.length > 0 ? mergedTags : null;
      if (data.isPrivate !== undefined) updates.isPrivate = isPrivate ? 'true' : 'false';
      if (tokenCount !== undefined) updates.tokenCount = tokenCount || null;
      if (messageCount !== undefined) updates.messageCount = messageCount || (Array.isArray(data) ? data.filter(item => item.type !== 'summary').length : (data.rawMessages ? data.rawMessages.filter(item => item.type !== 'summary').length : null));
      if (modelName !== undefined) updates.modelName = modelName || null;

      sessionMetadata = await updateSessionMetadata(sessionId, updates);
      
      console.log('Session updated successfully:', {
        sessionId,
        isPrivate,
        userId: user.userId,
        updatedFields: Object.keys(updates)
      });
    } else {
      // Create new session metadata in DynamoDB
      sessionMetadata = await createSessionMetadata({
        sessionId,
        userId: user.userId,
        username: user.username,
        avatarUrl: user.avatarUrl,
        isPrivate,
        sessionType,
        title: title || null,
        summary: summary || null,
        tags: tags ? (Array.isArray(tags) ? tags : [tags]) : null,
        tokenCount: tokenCount || null,
        messageCount: messageCount || (Array.isArray(data) ? data.filter(item => item.type !== 'summary').length : (data.rawMessages ? data.rawMessages.filter(item => item.type !== 'summary').length : null)),
        modelName: modelName || null,
      });

      console.log('Session created successfully:', {
        sessionId,
        isPrivate,
        userId: user.userId,
        hasMetadata: !!sessionMetadata
      });
    }

    return createResponse(201, {
      message: 'Session created',
      id: sessionId,
      format: Array.isArray(data) ? 'jsonl' : (data.rawMessages ? 'jsonl' : 'json'),
      recordCount: Array.isArray(data) ? data.filter(item => item.type !== 'summary').length : (data.rawMessages ? data.rawMessages.filter(item => item.type !== 'summary').length : 1),
      isPrivate,
      owner: {
        id: user.userId,
        username: user.username,
      },
      metadata: {
        title: sessionMetadata.title,
        summary: sessionMetadata.summary,
        tags: sessionMetadata.tags,
        tokenCount: sessionMetadata.tokenCount,
        messageCount: sessionMetadata.messageCount,
        modelName: sessionMetadata.modelName,
        sessionType: sessionMetadata.sessionType,
        createdAt: sessionMetadata.createdAt,
      }
    });

  } catch (error) {
    console.error('Error in createSession:', error);
    
    // If DynamoDB creation failed but S3 succeeded, we should clean up S3
    // For now, we'll log this and let it be handled manually
    if (error.message === 'Session already exists') {
      return createErrorResponse(409, 'Session with this ID already exists');
    }
    
    return createErrorResponse(400, `Error creating session: ${error.message}`);
  }
};
