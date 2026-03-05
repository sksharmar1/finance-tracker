# Charts Not Showing - Debugging Guide

## Step 1: Check if Servers Are Running

### Terminal 1 - Flask Backend
```bash
cd /Users/sksharma/PycharmProjects/finance-tracker/pythonProject
python main.py
```

**Should see:**
```
WARNING in app.run(): This is a development server. Do not use it in production deployments.
Use a production WSGI server instead.
* Running on http://127.0.0.1:5000
```

### Terminal 2 - React Frontend
```bash
cd /Users/sksharma/PycharmProjects/finance-tracker/pythonProject/frontend
npm start
```

**Should see:**
```
webpack compiled successfully
Compiled successfully!
You can now view frontend in the browser.
  Local: http://localhost:3000
```

---

## Step 2: Test the API Manually

### Get a Login Token
```bash
curl -X POST http://127.0.0.1:5000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'
```

**Response should be:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Copy the token (everything after `"access_token": "` and before the closing `"`)**

### Test Getting Expenses
```bash
curl -X GET http://127.0.0.1:5000/expenses \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Should return:**
```json
[
  {
    "id": 1,
    "amount": 45.50,
    "description": "Lunch at Restaurant",
    "category": "Food",
    "date": "2024-02-28T10:30:00"
  }
  ...
]
```

If you get `[]` (empty array), you need to add expenses.

---

## Step 3: Add Test Expenses via API

Use the token from Step 2 to add expenses:

```bash
curl -X POST http://127.0.0.1:5000/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "amount": 45.50,
    "description": "Lunch at Restaurant",
    "category": "Food"
  }'
```

Repeat with these different expenses:
```json
[
  {"amount": 12.00, "description": "Groceries", "category": "Food"},
  {"amount": 50.00, "description": "Uber to Office", "category": "Transport"},
  {"amount": 120.00, "description": "New Shoes", "category": "Shopping"},
  {"amount": 15.00, "description": "Movie Tickets", "category": "Entertainment"},
  {"amount": 80.00, "description": "Electricity Bill", "category": "Bills"}
]
```

---

## Step 4: Check Browser Console

1. Open `http://localhost:3000`
2. Login with: `testuser` / `password123`
3. Right-click → **Inspect** or press **F12**
4. Go to **Console** tab
5. Look for:
   - ✓ Green messages: `✓ Expenses fetched: [...]`
   - ✗ Red errors: `✗ Error fetching expenses: ...`

### Common Errors & Solutions

**"Invalid token"**
- The token isn't being sent correctly
- Check if localStorage is storing the token
- Console: `localStorage.getItem('token')`

**"Network error"**
- Flask backend isn't running
- Check Terminal 1 is showing "Running on http://127.0.0.1:5000"

**"CORS error"**
- Make sure CORS is enabled in app.py
- Should be: `CORS(app)`

---

## Step 5: Verify Token is Being Saved

In the browser Console, run:
```javascript
console.log(localStorage.getItem('token'))
```

Should print a long JWT token like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

If it prints `null`, the login didn't work.

---

## Step 6: Check Network Requests

1. Press **F12** to open DevTools
2. Go to **Network** tab
3. Refresh the page
4. Look for a request to `http://127.0.0.1:5000/expenses`
5. Click on it and check:
   - **Status**: Should be 200 (green)
   - **Response**: Should show your expenses array

---

## Quick Checklist

- [ ] Flask backend running on http://127.0.0.1:5000
- [ ] React frontend running on http://localhost:3000
- [ ] Logged in with valid credentials
- [ ] Browser console shows: `✓ Expenses fetched: [...]`
- [ ] Network tab shows 200 status for `/expenses` request
- [ ] At least 1 expense in the database
- [ ] Page shows "Loading your expenses..." then charts appear

If you complete all steps and charts still don't show, check for specific error messages in the browser console and share them.

