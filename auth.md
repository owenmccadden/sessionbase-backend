# GitHub OAuth Testing Instructions

## API Gateway URL
```
https://api.sessionbase.ai
```

## Testing Steps for Your GitHub OAuth Implementation

### 1. **Test Public Session Creation (No Auth Required)**
```bash
curl -X POST https://api.sessionbase.ai/sessions \
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
curl https://api.sessionbase.ai/sessions/{session-id}
```

**Expected:** Returns your session data

### 3. **Test GitHub OAuth Flow**
**Open this URL in your browser:**
```
https://api.sessionbase.ai/auth/github
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

### 3b. **Test Google OAuth Flow**
**Open this URL in your browser:**
```
https://api.sessionbase.ai/auth/google
```

**What should happen:**
1. Redirects to Google OAuth page with your app details
2. You authorize the app
3. Google redirects back to your callback
4. You get redirected to `http://localhost:3000?token=eyJ...`
5. **Copy the JWT token** from the URL (everything after `token=`)
6. **Use the same JWT environment variable:**
```bash
export JWT=""
```

### 4. **Test Private Session Creation (Requires Auth)**
```bash
curl -X POST https://api.sessionbase.ai/sessions \
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
curl https://api.sessionbase.ai/sessions/{private-session-id}
```
**Expected:** `401 Authentication required for private sessions`

**Try with auth (should work):**
```bash
curl https://api.sessionbase.ai/sessions/{private-session-id} \
  -H "Authorization: Bearer $JWT"
```
**Expected:** Returns your private session data

### 6. **Test Edge Cases**

**Create private session without auth (should fail):**
```bash
curl -X POST https://api.sessionbase.ai/sessions \
  -H "Content-Type: application/json" \
  -d '{"data": "trying to be private", "isPrivate": true}'
```
**Expected:** `401 Authentication required to create private sessions`

**Create public session while authenticated (should work):**
```bash
curl -X POST https://api.sessionbase.ai/sessions \
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

❌ **What Should Fail:**
- Private session access without auth
- Private session access with someone else's JWT

## Notes
- JWT tokens expire after 7 days
- Start with step 1 and work your way through
- The OAuth flow (step 3) requires a browser, not just curl
- Make sure your GitHub OAuth app callback URL is set to: `https://api.sessionbase.ai/auth/github/callback`
