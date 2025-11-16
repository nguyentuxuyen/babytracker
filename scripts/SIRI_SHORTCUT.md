Siri Shortcut: Log milk feed via Vercel serverless endpoint

Overview
- This repository includes a serverless endpoint at `/api/logMilk` that accepts POST requests to log milk feed entries to Firestore using a Firebase Admin service account.
- You'll create a Siri Shortcut that calls this endpoint whenever you say something like: "Log 150ml milk".

Required Vercel environment variables

Set these in your Vercel project settings (Settings → Environment Variables):

1. **FIREBASE_SERVICE_ACCOUNT** (required)
   - Value: The entire JSON content from your Firebase service account key file
   - How to get it:
     - Go to Firebase Console → Project Settings → Service Accounts
     - Click "Generate new private key"
     - Copy the entire JSON file content and paste as the value
   - Example format: `{"type":"service_account","project_id":"your-project",...}`

2. **LOG_SECRET** (required)
   - Value: A random secret string (e.g., `mySecret12345` or use a password generator)
   - This will be used in the Siri Shortcut to authenticate requests
   - Keep it private!

3. **SERVICE_ACCOUNT_USER_UID** (required)
   - Value: Your Firebase user UID (the one you use to login to the app)
   - How to get it: Login to your app, open browser console, and check `currentUser.uid`
   - Or check Firebase Console → Authentication → Users tab → copy the User UID
   - Example: `abc123def456ghi789`

4. **DEFAULT_BABY_ID** (optional)
   - Value: The baby document ID you want to log to by default
   - How to get it: Check Firestore Console → `users/{uid}/babies/{babyId}`
   - If you only have one baby, use that baby's document ID

API contract
POST /api/logMilk
Headers:
  - x-log-secret: <LOG_SECRET>
Body (JSON):
  {
    "amountMl": 150,
    "babyId": "<optional-baby-id>",
    "timestamp": "2025-10-15T10:00:00.000Z", // optional ISO string (default: now)
    "note": "Optional note"
  }
Response:
  { "success": true, "id": "<entry-id>" }

Siri Shortcut setup (iOS Shortcuts app)

**Method 1: Simple - Ask for number directly (recommended for beginners)**
1. Open Shortcuts app → tap "+" to create new Shortcut
2. Add "Ask for Input" action
   - Prompt: "How many ml?"
   - Input Type: Number
   - This creates a variable (tap on it to rename to "Amount")
3. Add "Current Date" action (creates "Current Date" variable)
4. Add "Format Date" action
   - Date: Current Date
   - Format: Custom → `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'`
   - Or use "ISO 8601" format
5. Add "Get Contents of URL" action
   - URL: `https://baby-tracker-app-1-pyp8624dz-nguyentuxuyens-projects.vercel.app/api/logMilk`
   - Method: POST
   - Headers: Add header
     - Key: `x-log-secret`
     - Value: `<YOUR_LOG_SECRET>` (paste your secret here)
   - Request Body: JSON
   - Tap "Add new field" → for each field:
     - `amountMl`: tap and select variable "Amount"
     - `timestamp`: tap and select variable "Formatted Date"
     - `note`: type "via Siri"
6. (Optional) Add "Show Result" to see the response
7. Tap the shortcut name at top → rename to "Log Milk"
8. Tap the (i) icon → "Add to Home Screen" or enable "Show in Share Sheet"

**Method 2: Advanced - Parse natural speech with JavaScript**
1. Open Shortcuts app → tap "+" to create new Shortcut
2. Add "Dictate Text" action (or "Ask for Input" with Type: Text)
   - This will prompt you to speak
   - Creates a variable "Dictated Text"
3. Add "Run JavaScript for Automation" action
   - Tap "Script" field and paste the contents of `scripts/parse_milk_shortcut.js`
   - In the JavaScript parameters, tap and add "Dictated Text" as input
   - This returns the parsed ml amount
4. Add "Current Date" action
5. Add "Format Date" action (format as ISO 8601)
6. Add "Get Contents of URL" action (same as Method 1, but use the JavaScript result as `amountMl`)
7. Rename and configure as in Method 1

**To use with Siri:**
- Say: "Hey Siri, Log Milk"
- Siri will ask "How many ml?" (Method 1) or prompt you to speak (Method 2)
- Speak the amount (e.g., "150" or "150 ml" or "0.15 liters")
- The shortcut will log it to Firebase

Security notes
- Keep `FIREBASE_SERVICE_ACCOUNT` and `LOG_SECRET` private in Vercel environment settings.
- Limit the actions the service account can perform in Firestore rules if possible (create-only to specific collection) and use `SERVICE_ACCOUNT_USER_UID` as a single account owner.

Testing with curl

**Step 1: Set up environment variables on Vercel**
```bash
# Go to: https://vercel.com/nguyentuxuyens-projects/baby-tracker-app-1/settings/environment-variables
# Add the 3 required variables (see above)
```

**Step 2: Redeploy to activate the new environment variables**
```bash
cd /path/to/baby-tracker-app-1
npm run build
vercel --prod --yes
```

**Step 3: Test the endpoint with curl**
```bash
# Replace <YOUR_LOG_SECRET> with your actual LOG_SECRET value
curl -X POST https://baby-tracker-app-1-pyp8624dz-nguyentuxuyens-projects.vercel.app/api/logMilk \
  -H "Content-Type: application/json" \
  -H "x-log-secret: <YOUR_LOG_SECRET>" \
  -d '{
    "amountMl": 150,
    "note": "test from curl",
    "timestamp": "2025-10-15T10:30:00.000Z"
  }'
```

**Expected success response:**
```json
{"success":true,"id":"some-firestore-document-id"}
```

**Common errors:**
- `401 Unauthorized` → Check your `x-log-secret` header matches `LOG_SECRET` env var
- `400 Invalid amountMl` → Ensure `amountMl` is a number (not a string)
- `400 Missing babyId` → Set `DEFAULT_BABY_ID` env var or pass `babyId` in request body
- `500 Internal server error` → Check Vercel function logs for details (Vercel Dashboard → Deployments → click deployment → Functions tab)

**Step 4: Verify in Firebase Console**
- Go to Firestore Console
- Navigate to: `users/{your-uid}/babies/{baby-id}/feeds/`
- You should see a new document with `amountMl: 150` and your timestamp

Troubleshooting
- If you get 401, ensure the header `x-log-secret` matches the `LOG_SECRET` env var.
- If the endpoint returns 500, check Vercel function logs for stack traces and ensure the service account JSON is valid and has Firestore access.
