#!/usr/bin/env bash
# This script adds test data using Flask shell

cd /Users/sksharma/PycharmProjects/finance-tracker/pythonProject

export FLASK_APP=app.py

python << 'EOF'
import sys
sys.path.insert(0, '/Users/sksharma/PycharmProjects/finance-tracker/pythonProject')

from app import app, db
from datetime import datetime, timezone, timedelta
import random
from werkzeug.security import generate_password_hash

# Must import after app context setup
with app.app_context():
    # Import models after app is initialized
    from app import User, Expense

    print("✓ Database connection initialized")

    # Check if test user exists
    test_user = User.query.filter_by(username='testuser').first()

    if not test_user:
        test_user = User(
            username='testuser',
            email='test@example.com',
            password_hash=generate_password_hash('password123')
        )
        db.session.add(test_user)
        db.session.commit()
        print("✓ Created test user: testuser / password123")
    else:
        print(f"✓ Test user already exists")

    # Sample expenses
    sample_expenses = [
        {'amount': 45.50, 'description': 'Lunch at Restaurant', 'category': 'Food'},
        {'amount': 12.00, 'description': 'Groceries', 'category': 'Food'},
        {'amount': 50.00, 'description': 'Uber to Office', 'category': 'Transport'},
        {'amount': 25.00, 'description': 'Coffee & Snacks', 'category': 'Food'},
        {'amount': 120.00, 'description': 'New Shoes', 'category': 'Shopping'},
        {'amount': 15.00, 'description': 'Movie Tickets', 'category': 'Entertainment'},
        {'amount': 80.00, 'description': 'Electricity Bill', 'category': 'Bills'},
        {'amount': 35.00, 'description': 'Dinner with Friends', 'category': 'Food'},
        {'amount': 30.00, 'description': 'Gas', 'category': 'Transport'},
        {'amount': 200.00, 'description': 'Phone Bill', 'category': 'Bills'},
    ]

    # Add expenses
    added_count = 0
    for exp_data in sample_expenses:
        days_ago = random.randint(0, 29)
        expense_date = datetime.now(timezone.utc) - timedelta(days=days_ago)

        expense = Expense(
            amount=exp_data['amount'],
            description=exp_data['description'],
            category=exp_data['category'],
            user_id=test_user.id,
            date=expense_date
        )
        db.session.add(expense)
        added_count += 1

    db.session.commit()
    print(f"✓ Added {added_count} test expenses")

    # Display summary
    expenses = Expense.query.filter_by(user_id=test_user.id).all()
    total = sum(e.amount for e in expenses)
    print(f"\n📊 Summary:")
    print(f"   Total Expenses: {len(expenses)}")
    print(f"   Total Amount: ${total:.2f}")
    print(f"\n✅ Test data added successfully!")
    print(f"\n👤 Login with:")
    print(f"   Username: testuser")
    print(f"   Password: password123")

EOF

