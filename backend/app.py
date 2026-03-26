from flask import Flask, request, jsonify
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os

# ====================== HYBRID ML + KEYWORD BOOST ======================
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
import pickle

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_FILE = os.path.join(BASE_DIR, 'category_model.pkl')

# Strong keyword mapping (high confidence)
keyword_map = {
    "pizza": "Food",
    "starbucks": "Food",
    "coffee": "Food",
    "uber": "Transport",
    "lyft": "Transport",
    "bus": "Transport",
    "taxi": "Transport",
    "netflix": "Entertainment",
    "spotify": "Entertainment",
    "hulu": "Entertainment",
    "amazon": "Shopping",
    "target": "Shopping",
    "walmart": "Shopping",
    "rent": "Bills",
    "electricity": "Bills",
    "internet": "Bills",
    "gift": "Gift Cards"
}

# Training data for ML fallback
training_descriptions = [
    "starbucks coffee", "morning coffee", "lunch", "dinner", "groceries", "pizza delivery",
    "uber ride", "lyft", "bus ticket", "gas", "fuel",
    "netflix subscription", "movie tickets", "spotify premium",
    "amazon shopping", "new shoes", "shirt",
    "electricity bill", "rent payment", "internet bill",
    "gift card", "birthday gift"
]
training_categories = [
    "Food", "Food", "Food", "Food", "Food", "Food",
    "Transport", "Transport", "Transport", "Transport", "Transport",
    "Entertainment", "Entertainment", "Entertainment",
    "Shopping", "Shopping", "Shopping",
    "Bills", "Bills", "Bills",
    "Gift Cards", "Gift Cards"
]

# Load or train model
if os.path.exists(MODEL_FILE):
    with open(MODEL_FILE, 'rb') as f:
        vectorizer, model = pickle.load(f)
    print("✅ Loaded saved ML model")
else:
    vectorizer = CountVectorizer()
    X = vectorizer.fit_transform(training_descriptions)
    model = MultinomialNB()
    model.fit(X, training_categories)
    with open(MODEL_FILE, 'wb') as f:
        pickle.dump((vectorizer, model), f)
    print("✅ Trained and saved ML model")

# ====================== FLASK SETUP ======================
load_dotenv()

app = Flask(__name__)

app.config['SECRET_KEY'] = os.getenv('SECRET_KEY') or 'super-secret-key-change-me-in-production'
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY') or 'jwt-secret-key-change-me'
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL') or 'postgresql:///finance_db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:3000"], supports_credentials=True)

db = SQLAlchemy(app)
jwt = JWTManager(app)

# ====================== MODELS ======================
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    expenses = db.relationship('Expense', backref='user', lazy=True)

class Expense(db.Model):
    __tablename__ = 'expenses'
    id = db.Column(db.Integer, primary_key=True)
    amount = db.Column(db.Float, nullable=False)
    description = db.Column(db.String(255))
    category = db.Column(db.String(50))
    date = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

class Feedback(db.Model):
    __tablename__ = 'feedback'
    id = db.Column(db.Integer, primary_key=True)
    description = db.Column(db.String(255), nullable=False)
    predicted = db.Column(db.String(50), nullable=False)
    actual = db.Column(db.String(50), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ====================== ROUTES ======================

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('email') or not data.get('password'):
        return jsonify({'msg': 'Missing fields'}), 400

    if User.query.filter_by(username=data['username']).first():
        return jsonify({'msg': 'Username already exists'}), 400

    if User.query.filter_by(email=data['email']).first():
        return jsonify({'msg': 'Email already exists'}), 400

    hashed_pw = generate_password_hash(data['password'])
    new_user = User(username=data['username'], email=data['email'], password_hash=hashed_pw)
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'msg': 'User created'}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(username=data.get('username')).first()

    if not user or not check_password_hash(user.password_hash, data.get('password')):
        return jsonify({'msg': 'Bad credentials'}), 401

    access_token = create_access_token(identity=str(user.id), expires_delta=timedelta(days=7))
    return jsonify(access_token=access_token), 200

@app.route('/expenses', methods=['GET'])
@jwt_required()
def get_expenses():
    user_id = int(get_jwt_identity())
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
    user_id = int(get_jwt_identity())
    data = request.get_json()

    if not data or not data.get('amount'):
        return jsonify({'msg': 'Amount required'}), 400

    new_exp = Expense(
        amount=data['amount'],
        description=data.get('description'),
        category=data.get('category', 'Other'),
        user_id=user_id
    )
    db.session.add(new_exp)
    db.session.commit()
    return jsonify({'msg': 'Expense added', 'id': new_exp.id}), 201

@app.route('/expenses/<int:expense_id>', methods=['DELETE'])
@jwt_required()
def delete_expense(expense_id):
    user_id = int(get_jwt_identity())
    exp = Expense.query.filter_by(id=expense_id, user_id=user_id).first()
    if not exp:
        return jsonify({'msg': 'Expense not found'}), 404
    db.session.delete(exp)
    db.session.commit()
    return jsonify({'msg': 'Expense deleted'}), 200

# ====================== PREDICT ENDPOINT ======================
@app.route('/predict-category', methods=['POST'])
def predict_category():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'category': 'Other', 'confidence': 0.0}), 200

        description = data.get('description', '').strip().lower()

        if not description:
            return jsonify({'category': 'Other', 'confidence': 0.0}), 200

        # 1. Strong keyword matching (high confidence)
        for keyword, cat in keyword_map.items():
            if keyword in description:
                return jsonify({'category': cat, 'confidence': 0.95}), 200

        # 2. Fall back to ML model
        X_new = vectorizer.transform([description])
        predicted = model.predict(X_new)[0]
        proba = model.predict_proba(X_new)[0]
        confidence = float(max(proba))

        return jsonify({
            'category': predicted,
            'confidence': round(confidence, 4)
        }), 200
    except Exception as e:
        print(f"Predict error: {e}")
        return jsonify({'category': 'Other', 'confidence': 0.0, 'error': str(e)}), 200

# ====================== FEEDBACK ENDPOINT ======================
@app.route('/feedback', methods=['POST'])
@jwt_required()
def save_feedback():
    try:
        user_id = int(get_jwt_identity())
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
        return jsonify({'msg': 'Feedback saved successfully'}), 201
    except Exception as e:
        db.session.rollback()
        print(f"Feedback error: {str(e)}")
        return jsonify({'msg': 'Server error'}), 500

# ====================== CREATE TABLES ======================
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True)