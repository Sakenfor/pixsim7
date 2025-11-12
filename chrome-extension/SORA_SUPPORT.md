# Sora Support in PixSim7 Extension

## How It Works

The extension now supports OpenAI Sora account imports with special bearer token capture.

### Detection
- Detects when you visit `sora.chatgpt.com` or `chatgpt.com`
- Checks for OpenAI session cookies:
  - `__Secure-next-auth.session-token`
  - `oai-device-id`

### Bearer Token Capture
Sora uses JWT bearer tokens in the `Authorization` header (not cookies like Pixverse).

**How we capture it:**
1. Extension injects a script into the page on load
2. Script intercepts `fetch()` requests
3. Captures `Authorization: Bearer ...` header
4. Stores token in `window.__pixsim7_bearer_token`
5. Content script reads it when importing

### Import Flow

1. **You visit Sora** → Extension detects you're logged in
2. **You use Sora** → First API request captures bearer token
3. **Extension imports** → Sends to backend with cookies + bearer token
4. **Backend parses** → `SoraProvider.extract_account_data()` extracts:
   - Email from JWT payload
   - User ID from JWT payload
   - Device ID from cookies

### What Gets Sent to Backend

```javascript
{
  "provider_id": "sora",
  "url": "https://sora.chatgpt.com",
  "raw_data": {
    "cookies": {
      "__Secure-next-auth.session-token": "...",
      "oai-device-id": "...",
      // ... other cookies
    },
    "bearer_token": "eyJhbGci...",  // JWT token
    "authorization": "Bearer eyJhbGci..."
  }
}
```

### Backend Processing

The `SoraProvider.extract_account_data()` method:
1. Extracts bearer token from `raw_data.bearer_token`
2. Decodes JWT payload (base64)
3. Reads email from `https://api.openai.com/profile`
4. Reads user ID from `https://api.openai.com/auth`
5. Stores device ID from cookies
6. Creates/updates Sora account

## Testing

1. **Load extension** in Chrome (chrome://extensions)
2. **Visit sora.chatgpt.com** and log in
3. **Use Sora once** (generate anything) - this triggers API call to capture bearer token
4. **Check console** - should see:
   ```
   [PixSim7 Content] Injecting bearer token capture for sora
   [PixSim7 Content] *** LOGIN DETECTED ***
   [PixSim7 Content] Extracted raw data: {cookies: 15, hasBearerToken: true}
   [PixSim7 Content] ✓ Cookies imported successfully
   ```

## Limitations

- **Bearer token expires** - Need to re-import when JWT expires (~24 hours)
- **Requires user action** - Must use Sora at least once for extension to capture token
- **No refresh token** - Can't auto-renew, need manual re-import

## Future Improvements

1. **Background script monitoring** - Listen to network requests globally
2. **Token refresh detection** - Detect when new token is issued
3. **Expiry warnings** - Notify user before token expires
4. **Multiple sessions** - Handle multiple Sora accounts/sessions

## Differences from Pixverse

| Feature | Pixverse | Sora |
|---------|----------|------|
| Auth method | Cookies (`_ai_token`) | Bearer token in headers |
| Capture method | Direct cookie read | Network interception |
| Token location | `document.cookie` | `Authorization` header |
| Auto-detect | Immediate | Requires user interaction |
| Import timing | On page load | After first API call |

## Troubleshooting

**No bearer token captured:**
- Make sure you actually used Sora (generate video/image)
- Check browser console for errors
- Reload page and try again

**Import failed:**
- Check if PixSim7 backend is running
- Verify you're logged into PixSim7
- Check network tab for 401 errors

**Token expired:**
- Just use Sora again - extension will auto-import new token
- Or click "Manual Import" in extension popup
