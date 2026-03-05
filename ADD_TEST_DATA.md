# How to Add Test Expenses to Your Finance Tracker

Since the charts need data to display, here are the easiest ways to add test expenses:

## Option 1: Use the Web UI (Recommended - Easiest)

1. Open your finance tracker at `http://localhost:3000`
2. **Login or Register** with credentials:
   - Username: `testuser`
   - Password: `password123`
3. Once on the dashboard, use the **"Add New Expense"** form to add expenses
4. Fill in:
   - **Amount**: Enter a dollar amount (e.g., 45.50)
   - **Description**: Enter a description (e.g., "Lunch at Restaurant")
   - **Category**: Select from the dropdown (Food, Transport, Shopping, etc.)
   - Click **"Add Expense"**

5. The pie chart and bar chart will automatically update as you add expenses

## Option 2: Use curl to Add Expenses via API

First, login to get a token:

```bash
curl -X POST http://127.0.0.1:5000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'
```

Copy the `access_token` from the response.

Then add an expense:

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

Repeat this for multiple expenses with different amounts and categories.

## Sample Expenses to Add

Try adding these expenses to populate your charts:

| Amount | Description | Category |
|--------|-------------|----------|
| $45.50 | Lunch at Restaurant | Food |
| $12.00 | Groceries | Food |
| $50.00 | Uber to Office | Transport |
| $25.00 | Coffee & Snacks | Food |
| $120.00 | New Shoes | Shopping |
| $15.00 | Movie Tickets | Entertainment |
| $80.00 | Electricity Bill | Bills |
| $35.00 | Dinner with Friends | Food |
| $30.00 | Gas | Transport |
| $200.00 | Phone Bill | Bills |

## What Happens After Adding Data

Once you add expenses:

1. **Pie Chart** - Shows spending breakdown by category (Food, Transport, Shopping, etc.)
2. **Bar Chart** - Shows your 5 most recent expenses with amounts
3. **Total Spent** - The big number at the top updates automatically
4. **Expenses Table** - All your expenses appear in a table below

## Troubleshooting

### Charts Still Not Showing?
- Make sure you've added at least 1 expense
- Refresh the page (F5 or Cmd+R)
- Check the browser console for errors (F12 > Console tab)

### Can't Login?
- If the test user doesn't exist, use the **Register** page to create a new account
- Make sure the Flask backend is running at `http://127.0.0.1:5000`

### Expenses Not Appearing?
- Check that you're logged in (should show "Logout" button)
- Make sure the API token is valid
- Check the browser console for error messages

## Testing the API

To verify expenses are being saved, you can fetch them:

```bash
curl -X GET http://127.0.0.1:5000/expenses \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

This should return a JSON array of all your expenses.

