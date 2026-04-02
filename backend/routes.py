from flask import request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash #add to pip if not already

import finance_app
from models import db, User, Expense, Feedback
from datetime import timedelta

# User Registration
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('email') or not data.get('password'):
        return jsonify({'msg': 'Missing fields'}), 400
    email = data.get('email')

    if User.query.filter_by(username=data['username']).first() or User.query.filter_by(email=email).first():
        return jsonify({'message': 'Username or email already exists'}), 400

    hashed_pw = generate_password_hash(data['password'])
    new_user = User(
        username=data['username'],
        email=data['email'],
        password_hash=hashed_pw
    )
    db.session.add(new_user)
    db.session.commit()

    return jsonify({'message': 'User registered successfully'}), 201

# User Login
@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(username=data.get('username')).first()

    if not user or not check_password_hash(user.password_hash, data.get('password')):
        return jsonify({'msg': 'Bad credentials'}), 401

    access_token = create_access_token(
        identity=user.id,
        expires_delta=timedelta(days=7)
    )
    return jsonify(access_token=access_token), 200

#Protected: Get ALl Expenses for logged in user
@app.route('/expenses', methods=['GET'])
@jwt_required()
def get_expenses():
    user_id = get_jwt_identity()
    expenses = Expense.query.filter_by(user_id=user_id).all()
    return jsonify([{
        'id': e.id,
        'amount': e.amount,
        'description': e.description,
        'category': e.category,
        'date': e.date.isoformat()
    } for e in expenses]), 200

#Add expense
@finance_app.route('/expenses', methods=['POST'])
@jwt_required()
def add_expense():
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data or not data.get('amount'):
        return jsonify({'msg': 'Amount required'}), 400

    new_exp = Expense(
        amount=data['amount'],
        description=data.get('description'),
        category=data.get('category'),  # Later: ML override
        user_id=user_id
    )
    db.session.add(new_exp)
    db.session.commit()
    return jsonify({'msg': 'Expense added', 'id': new_exp.id}), 201

#Delete expense
@app.route('/expenses/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_expense(id):
    user_id = get_jwt_identity()
    expense = Expense.query.filter_by(id=id, user_id=user_id).first()

    if not expense:
        return jsonify({'msg': 'Expense not found'}), 404

    db.session.delete(expense)
    db.session.commit()
    return jsonify({'msg': 'Expense deleted'}), 200

# Save feedback on AI predictions
@finance_app.route('/feedback', methods=['POST'])
@jwt_required()
def save_feedback():
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data or not data.get('description') or not data.get('predicted') or not data.get('actual'):
        return jsonify({'msg': 'Missing required fields'}), 400

    feedback = Feedback(
        description=data.get('description'),
        predicted=data.get('predicted'),
        actual=data.get('actual'),
        user_id=user_id
    )
    db.session.add(feedback)
    db.session.commit()
    return jsonify({'msg': 'Feedback saved successfully', 'id': feedback.id}), 201

# Bonus starters: Update & Delete (implement similarly)
# @app.route('/expenses/<int:id>', methods=['PUT'])
# @jwt_required()
# ...

