from flask import Flask, request, jsonify
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta, timezone
from config import Config
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config.from_object(Config)

# Enable CORS
CORS(app)

db = SQLAlchemy(app)
jwt = JWTManager(app)

# Add this error handler
@jwt.invalid_token_loader
def invalid_token_callback(error):
    print("INVALID TOKEN ERROR:", error)           # This will show in terminal
    return jsonify(msg="Invalid token", error=str(error)), 422

@jwt.unauthorized_loader
def unauthorized_callback(error):
    print("UNAUTHORIZED (no token?):", error)
    return jsonify(msg="Missing or invalid Authorization header", error=str(error)), 401

@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    print("EXPIRED TOKEN:", jwt_payload)
    return jsonify(msg="Token has expired"), 401

@jwt.token_verification_failed_loader
def token_verification_failed(jwt_header, jwt_payload):
    print("TOKEN VERIFICATION FAILED:", jwt_payload)
    return jsonify(msg="Token verification failed"), 422

# ────────────────────────────────────────────────
# MODELS (you can keep them here or move to models.py later)
# ────────────────────────────────────────────────

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    expenses = db.relationship('Expense', backref='user', lazy=True)


class Expense(db.Model):
    __tablename__ = 'expenses'
    id = db.Column(db.Integer, primary_key=True)
    amount = db.Column(db.Float, nullable=False)
    description = db.Column(db.String(255))
    category = db.Column(db.String(50))
    date = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)


# ────────────────────────────────────────────────
# ROUTES
# ────────────────────────────────────────────────

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('email') or not data.get('password'):
        return jsonify({'msg': 'Missing fields'}), 400

    if User.query.filter_by(username=data['username']).first():
        return jsonify({'msg': 'User exists'}), 400

    hashed_pw = generate_password_hash(data['password'])
    new_user = User(
        username=data['username'],
        email=data['email'],
        password_hash=hashed_pw
    )
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'msg': 'User created'}), 201


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(username=data.get('username')).first()

    if not user or not check_password_hash(user.password_hash, data.get('password')):
        return jsonify({'msg': 'Bad credentials'}), 401

    # CHANGE: Convert user.id to str
    access_token = create_access_token(
        identity=str(user.id),  # ← Add str() here
        expires_delta=timedelta(days=7)
    )
    return jsonify(access_token=access_token), 200


@app.route('/expenses', methods=['GET'])
@jwt_required()
def get_expenses():
    print("Authorization header received:", request.headers.get('Authorization'))
    user_id = int(get_jwt_identity())  # Convert back to int for DB queries
    expenses = Expense.query.filter_by(user_id=user_id).all()
    return jsonify([{
        'id': e.id,
        'amount': e.amount,
        'description': e.description,
        'category': e.category,
        'date': e.date.isoformat()
    } for e in expenses]), 200


@app.route('/expenses', methods=['POST'])
@jwt_required()
def add_expense():
    user_id = int(get_jwt_identity())  # Convert back to int for DB queries
    data = request.get_json()

    if not data or not data.get('amount'):
        return jsonify({'msg': 'Amount required'}), 400

    new_exp = Expense(
        amount=data['amount'],
        description=data.get('description'),
        category=data.get('category'),
        user_id=user_id
    )
    db.session.add(new_exp)
    db.session.commit()
    return jsonify({'msg': 'Expense added', 'id': new_exp.id}), 201


@app.route('/expenses/<int:expense_id>', methods=['PUT'])
@jwt_required()
def update_expense(expense_id):
    user_id = int(get_jwt_identity())
    exp = Expense.query.filter_by(id=expense_id, user_id=user_id).first()
    if not exp:
        return jsonify({'msg': 'Expense not found'}), 404

    data = request.get_json()
    if 'amount' in data:
        exp.amount = data['amount']
    if 'description' in data:
        exp.description = data['description']
    if 'category' in data:
        exp.category = data['category']

    db.session.commit()
    return jsonify({'msg': 'Expense updated'}), 200

@app.route('/expenses/<int:expense_id>', methods=['DELETE'])
@jwt_required()
def delete_expense(expense_id):
    user_id = int(get_jwt_identity())
    exp = Expense.query.filter_by(id=expense_id, user_id=user_id).first()
    if not exp:
        return jsonify({'msg': 'Expense not found'}), 404

    db.session.delete(exp)
    db.session.commit()
    return jsonify({'msg': 'Expense Deleted'}), 200

@app.route('/me', methods=['GET'])
@jwt_required()
def get_me():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    return jsonify({
        'username': user.username,
        'email': user.email
    }), 200

@app.errorhandler(Exception)
def handle_exception(e):
    #log the exception here if needed
    print("EXCEPTION:", str(e))
    return jsonify(msg="An error occurred", error=str(e)), 500


# Create tables (safe to run multiple times)
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True)