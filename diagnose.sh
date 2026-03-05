#!/bin/bash

echo "======================================"
echo "Finance Tracker Diagnostic Check"
echo "======================================"
echo ""

# Check Flask
echo "🔍 Checking Flask Backend..."
if lsof -i :5000 > /dev/null 2>&1; then
    echo "✅ Flask running on port 5000"
else
    echo "❌ Flask NOT running on port 5000"
    echo "   Run: cd /Users/sksharma/PycharmProjects/finance-tracker/pythonProject && python main.py"
fi

echo ""

# Check React
echo "🔍 Checking React Frontend..."
if lsof -i :3000 > /dev/null 2>&1; then
    echo "✅ React running on port 3000"
else
    echo "❌ React NOT running on port 3000"
    echo "   Run: cd /Users/sksharma/PycharmProjects/finance-tracker/pythonProject/frontend && npm start"
fi

echo ""

# Check API response
echo "🔍 Testing API Connection..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET http://127.0.0.1:5000/expenses \
  -H "Authorization: Bearer test" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "422" ] || [ "$HTTP_CODE" = "401" ]; then
    echo "✅ API responding (Token error expected - need valid token)"
    echo "   HTTP Status: $HTTP_CODE"
elif [ "$HTTP_CODE" = "200" ]; then
    echo "✅ API responding with valid data"
    echo "   HTTP Status: $HTTP_CODE"
    echo "   Data: $BODY"
else
    echo "❌ API not responding correctly"
    echo "   HTTP Status: $HTTP_CODE"
    echo "   Response: $BODY"
fi

echo ""
echo "======================================"
echo "Next Steps:"
echo "1. Make sure both servers are running"
echo "2. Login to http://localhost:3000"
echo "3. Add at least one expense"
echo "4. Charts should appear automatically"
echo "======================================"

