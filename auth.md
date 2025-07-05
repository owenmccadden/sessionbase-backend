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

### 4. **Test Private Session Creation (Requires Auth)**
```bash
# Replace YOUR_JWT_TOKEN with the token from step 3
curl -X POST https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
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
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
**Expected:** Returns your private session data

### 6. **Test Edge Cases**

**Create private session without auth (should fail):**
```bash
curl -X POST https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions \
  -H "Content-Type: application/json" \
  -d '{"data": "trying to be private", "isPrivate": true}'
```
**Expected:** Session created as public (isPrivate: false) since no auth provided

**Create public session while authenticated (should work):**
```bash
curl -X POST https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"data": "public but by authenticated user", "isPrivate": false}'
```

## Quick Verification Checklist

✅ **What Should Work:**
- Public sessions (create/read) with or without auth
- GitHub OAuth redirect flow
- Private session creation with valid JWT
- Private session access with valid JWT (owner only)

❌ **What Should Fail:**
- Private session access without auth
- Private session access with someone else's JWT

## Notes
- JWT tokens expire after 7 days
- Start with step 1 and work your way through
- The OAuth flow (step 3) requires a browser, not just curl
- Make sure your GitHub OAuth app callback URL is set to: `https://3p6r50x58k.execute-api.us-east-1.amazonaws.com/auth/github/callback`
