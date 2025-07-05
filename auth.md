# GitHub OAuth Testing Instructions

## API Gateway URL
```
https://3p6r50x58k.execute-api.us-east-1.amazonaws.com
```

## Testing Steps for Your GitHub OAuth Implementation

### 1. **Test Public Session Creation (No Auth Required)**
```bash
curl -X POST https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions \
  -H "Content-Type: application/json" \
  -d '{"data": "test public session", "isPrivate": false}'
```

**Expected Response:**
```json
{
  "message": "Session created",
  "id": "some-uuid-here",
  "format": "json",
  "recordCount": 1,
  "isPrivate": false,
  "owner": null
}
```

### 2. **Test Public Session Access**
```bash
# Replace {session-id} with the actual ID from step 1
curl https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions/{session-id}
```

**Expected:** Returns your session data

### 3. **Test GitHub OAuth Flow**
**Open this URL in your browser:**
```
https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/auth/github
```

**What should happen:**
1. Redirects to GitHub OAuth page with your app details
2. You authorize the app
3. GitHub redirects back to your callback
4. You get redirected to `http://localhost:3000?token=eyJ...`
5. **Copy the JWT token** from the URL (everything after `token=`)
6. **Export it as an environment variable:**
```bash
export JWT=""
```

### 4. **Test Private Session Creation (Requires Auth)**
```bash
curl -X POST https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{"data": "my private session", "isPrivate": true}'
```

**Expected Response:**
```json
{
  "message": "Session created",
  "id": "some-uuid-here",
  "isPrivate": true,
  "owner": {
    "id": 12345678,
    "username": "your-github-username"
  }
}
```

### 5. **Test Private Session Access Control**

**Try without auth (should fail):**
```bash
curl https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions/{private-session-id}
```
**Expected:** `401 Authentication required for private sessions`

**Try with auth (should work):**
```bash
curl https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions/{private-session-id} \
  -H "Authorization: Bearer $JWT"
```
**Expected:** Returns your private session data

### 6. **Test Share Link Creation (NEW)**

**Create a share link for your private session:**
```bash
# Replace {private-session-id} with your private session ID from step 4
curl -X POST https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions/{private-session-id}/share \
  -H "Authorization: Bearer $JWT"
```

**Expected Response:**
```json
{
  "shareToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "shareUrl": "https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/shared/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "sessionId": "your-session-id",
  "expiresIn": "30d",
  "createdAt": "2025-07-05T14:00:00.000Z"
}
```

**Optional: Create share link with custom expiration:**
```bash
# 7 days
curl -X POST "https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions/{private-session-id}/share?expires=7d" \
  -H "Authorization: Bearer $JWT"

# 90 days  
curl -X POST "https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions/{private-session-id}/share?expires=90d" \
  -H "Authorization: Bearer $JWT"

# 1 year
curl -X POST "https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions/{private-session-id}/share?expires=1y" \
  -H "Authorization: Bearer $JWT"

# Never expires (permanent link)
curl -X POST "https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions/{private-session-id}/share?expires=never" \
  -H "Authorization: Bearer $JWT"
```

**Expected Response for never-expiring token:**
```json
{
  "shareToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "shareUrl": "https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/shared/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "sessionId": "your-session-id",
  "expiresIn": "never",
  "hasExpiration": false,
  "createdAt": "2025-07-05T14:00:00.000Z"
}
```

### 7. **Test Shared Session Access (NEW)**

**Access the private session via share link (no auth required):**
```bash
# Use the shareUrl from step 6, or construct it manually:
curl https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/shared/{share-token}
```

**Expected:** Returns the private session data with additional headers:
- `X-Session-Shared: true`
- `X-Session-Owner: your-github-username`
- `X-Session-Created: creation-timestamp`
- `X-Share-Has-Expiration: true/false`
- `X-Share-Expires-At: expiration-timestamp` (only if has expiration)
- `X-Share-Created-At: share-creation-timestamp`

**Test expired share link:**
```bash
# This would return 410 Gone if the share token has expired
curl https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/shared/{expired-share-token}
```
**Expected:** `410 Share link has expired`

### 8. **Test Share Link Edge Cases**

**Try to share a public session (should fail):**
```bash
curl -X POST https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions/{public-session-id}/share \
  -H "Authorization: Bearer $JWT"
```
**Expected:** `400 Only private sessions can be shared via links`

**Try to share someone else's private session (should fail):**
```bash
# This would require having another user's private session ID
curl -X POST https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions/{other-users-session}/share \
  -H "Authorization: Bearer $JWT"
```
**Expected:** `403 You can only create share links for your own sessions`

**Try to create share link without auth (should fail):**
```bash
curl -X POST https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions/{private-session-id}/share
```
**Expected:** `401 Authentication required`

**Try invalid expiration option (should fail):**
```bash
curl -X POST "https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions/{private-session-id}/share?expires=invalid" \
  -H "Authorization: Bearer $JWT"
```
**Expected:** `400 Invalid expiration option. Valid options: 7d, 30d, 90d, 1y, never`

### 9. **Test Edge Cases**

**Create private session without auth (should fail):**
```bash
curl -X POST https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions \
  -H "Content-Type: application/json" \
  -d '{"data": "trying to be private", "isPrivate": true}'
```
**Expected:** `401 Authentication required to create private sessions`

**Create public session while authenticated (should work):**
```bash
curl -X POST https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{"data": "public but by authenticated user", "isPrivate": false}'
```

## Quick Verification Checklist

✅ **What Should Work:**
- Public sessions (create/read) with or without auth
- GitHub OAuth redirect flow
- Private session creation with valid JWT
- Private session access with valid JWT (owner only)
- **Share link creation for private sessions (owner only)**
- **Shared session access via share URL (no auth required)**

❌ **What Should Fail:**
- Private session access without auth
- Private session access with someone else's JWT
- **Share link creation for public sessions**
- **Share link creation without auth**
- **Share link creation for other users' sessions**

## Sharing Feature Summary

The sharing functionality allows:
- **Private session owners** to generate shareable links
- **Anyone with the share URL** to access the private session
- **Configurable expiration** (7d, 30d, 90d, 1y, never)
- **Never-expiring tokens** for permanent sharing
- **Detailed expiration info** in response headers
- **Graceful expiration handling** with specific error messages
- **No authentication required** to access shared sessions
- **Original session remains private** - only accessible via share link or owner auth

## Notes
- JWT tokens expire after 7 days
- **Share tokens**: 7d, 30d (default), 90d, 1y, or never
- **Never-expiring share tokens** are permanent until manually revoked
- **Expired share links** return 410 Gone with clear error message
- Start with step 1 and work your way through
- The OAuth flow (step 3) requires a browser, not just curl
- Make sure your GitHub OAuth app callback URL is set to: `https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/auth/github/callback`
