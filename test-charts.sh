#!/bin/bash

# Finance Tracker - Test and Debug Script

echo "============================================"
echo "Finance Tracker - Comprehensive Test Script"
echo "============================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check Flask Backend
echo -e "${YELLOW}TEST 1: Checking Flask Backend...${NC}"
if curl -s http://127.0.0.1:5000/expenses -H "Authorization: Bearer test" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Flask backend is responding${NC}"
else
    echo -e "${RED}❌ Flask backend is NOT responding${NC}"
    echo "   Start Flask with: python main.py"
    exit 1
fi

echo ""

# Test 2: Try to login
echo -e "${YELLOW}TEST 2: Testing User Login...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST http://127.0.0.1:5000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}')

if echo "$LOGIN_RESPONSE" | grep -q "access_token"; then
    TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}✅ Login successful${NC}"
    echo "   Token: ${TOKEN:0:20}..."
else
    echo -e "${RED}❌ Login failed${NC}"
    echo "   Response: $LOGIN_RESPONSE"
    echo "   Try registering a new user first"
    exit 1
fi

echo ""

# Test 3: Fetch expenses
echo -e "${YELLOW}TEST 3: Fetching Expenses...${NC}"
EXPENSES=$(curl -s -X GET http://127.0.0.1:5000/expenses \
  -H "Authorization: Bearer $TOKEN")

if echo "$EXPENSES" | grep -q "\["; then
    COUNT=$(echo "$EXPENSES" | grep -o '"id"' | wc -l)
    echo -e "${GREEN}✅ Expenses API working${NC}"
    echo "   Found $COUNT expenses"
    if [ $COUNT -eq 0 ]; then
        echo -e "${YELLOW}⚠️  No expenses found - charts will be empty${NC}"
        echo "   Add expenses and charts will appear"
    else
        echo "   Sample: $(echo "$EXPENSES" | head -c 100)..."
    fi
else
    echo -e "${RED}❌ Failed to fetch expenses${NC}"
    echo "   Response: $EXPENSES"
fi

echo ""
echo -e "${YELLOW}TEST 4: What You Should See on Dashboard${NC}"
echo -e "${GREEN}✅ If no errors above:${NC}"
echo "   1. Open http://localhost:3000"
echo "   2. See the DEBUG INFO panel showing:"
echo "      - Expenses Count: (should be > 0 if expenses added)"
echo "      - Category Data Points: (should be > 0)"
echo "      - Recent Data Points: (should be > 0)"
echo "   3. Pie Chart (red background) should render"
echo "   4. Bar Chart (red background) should render"
echo ""

echo -e "${YELLOW}TEST 5: Browser Console Checks${NC}"
echo "Open DevTools (F12) and check:"
echo "  - ✅ '📡 Fetching expenses...' message"
echo "  - ✅ '✅ Response received:' with array of expenses"
echo "  - ✅ '📊 Category data for pie chart:' with data"
echo "  - ✅ '📈 Recent data for bar chart:' with data"
echo ""

echo -e "${YELLOW}If charts still don't show:${NC}"
echo "  1. Check browser console (F12 → Console tab)"
echo "  2. Look for any red error messages"
echo "  3. Run this script again to verify APIs work"
echo "  4. Refresh the page (Ctrl+Shift+R for hard refresh)"
echo ""
echo "============================================"

