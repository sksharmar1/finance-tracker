from flask import Flask, request, jsonify, Response
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import os

# ====================== HYBRID ML + KEYWORD BOOST ======================
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
import pickle
import json
import anthropic

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


# ====================== HOUSEHOLD MODELS ======================
class Household(db.Model):
    __tablename__ = 'households'
    id          = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(120), nullable=False)
    invite_code = db.Column(db.String(8), unique=True, nullable=False)
    owner_id    = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    owner   = db.relationship('User', foreign_keys=[owner_id])
    members = db.relationship('HouseholdMember', backref='household', lazy=True,
                              cascade='all, delete-orphan')

class HouseholdMember(db.Model):
    __tablename__ = 'household_members'
    id           = db.Column(db.Integer, primary_key=True)
    household_id = db.Column(db.Integer, db.ForeignKey('households.id'), nullable=False)
    user_id      = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    role         = db.Column(db.String(20), default='member')   # 'owner' or 'member'
    joined_at    = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', foreign_keys=[user_id])

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


# ====================== CHAT ENDPOINT ======================
@app.route('/chat', methods=['POST'])
@jwt_required()
def chat():
    try:
        data = request.get_json()
        if not data or not data.get('messages'):
            return jsonify({'msg': 'Missing messages'}), 400

        messages = data.get('messages', [])
        context  = data.get('context', '')

        client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

        response = client.messages.create(
            model='claude-opus-4-5',
            max_tokens=1024,
            system=f"You are a helpful personal finance assistant embedded in a finance tracking app. "
                   f"Be concise, friendly, and give practical actionable advice. "
                   f"User spending context: {context} "
                   f"Keep responses under 120 words unless detail is genuinely needed.",
            messages=messages
        )

        reply = response.content[0].text if response.content else "Sorry, I couldn't respond right now."
        return jsonify({'reply': reply}), 200

    except anthropic.AuthenticationError:
        return jsonify({'msg': 'API key missing or invalid. Set ANTHROPIC_API_KEY in your .env file.'}), 500
    except Exception as e:
        print(f"Chat error: {str(e)}")
        return jsonify({'msg': f'Chat error: {str(e)}'}), 500


# ====================== PARSE EXPENSE ENDPOINT ======================
@app.route('/parse-expense', methods=['POST'])
@jwt_required()
def parse_expense():
    try:
        data = request.get_json()
        text = (data.get('text') or '').strip()
        if not text:
            return jsonify({'msg': 'No text provided'}), 400
        client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
        prompt = (
            f'Extract expense details from this natural language input: "{text}"\n\n'
            'Return ONLY a JSON object with exactly these three fields, no markdown, no explanation:\n'
            '{"amount": <number>, "description": "<concise name>", "category": "<one of: Food, Transport, Shopping, Entertainment, Bills, Gift Cards, Other>"}\n\n'
            'Rules:\n'
            '- amount must be a positive number extracted from the text\n'
            '- description should be short and clean, e.g. "Starbucks coffee"\n'
            '- category must be exactly one of the listed values\n'
            '- If no amount is found, set amount to 0'
        )
        response = client.messages.create(
            model='claude-opus-4-5', max_tokens=200,
            messages=[{'role': 'user', 'content': prompt}]
        )
        raw = response.content[0].text.strip()
        if '```' in raw:
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        raw = raw.strip()
        parsed = json.loads(raw)
        amount = float(parsed.get('amount', 0))
        if amount <= 0:
            return jsonify({'msg': 'Could not detect an amount. Try: "Coffee $4.50"'}), 400
        valid_cats = ['Food','Transport','Shopping','Entertainment','Bills','Gift Cards','Other']
        cat = parsed.get('category', 'Other')
        return jsonify({
            'amount': round(amount, 2),
            'description': str(parsed.get('description', text))[:255],
            'category': cat if cat in valid_cats else 'Other'
        }), 200
    except anthropic.AuthenticationError:
        return jsonify({'msg': 'API key missing or invalid.'}), 500
    except json.JSONDecodeError as e:
        return jsonify({'msg': f'JSON parse error: {str(e)}'}), 400
    except Exception as e:
        print(f"Parse expense error: {type(e).__name__}: {str(e)}")
        return jsonify({'msg': f'Parse error: {type(e).__name__}: {str(e)}'}), 400


# ====================== RECEIPT SCAN ENDPOINT ======================
@app.route('/scan-receipt', methods=['POST'])
@jwt_required()
def scan_receipt():
    try:
        data = request.get_json()
        image_b64 = data.get('image', '')
        media_type = data.get('media_type', 'image/jpeg')
        if not image_b64:
            return jsonify({'msg': 'No image provided'}), 400
        client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
        response = client.messages.create(
            model='claude-opus-4-5', max_tokens=300,
            messages=[{'role': 'user', 'content': [
                {'type': 'image', 'source': {'type': 'base64', 'media_type': media_type, 'data': image_b64}},
                {'type': 'text', 'text': (
                    'Extract the expense details from this receipt image.\n'
                    'Return ONLY a JSON object with exactly these fields, no markdown:\n'
                    '{"amount": <total amount as number>, "description": "<merchant or item name, concise>", '
                    '"category": "<one of: Food, Transport, Shopping, Entertainment, Bills, Gift Cards, Other>"}\n'
                    'Use the total/grand total amount. If unclear, use the largest amount shown.'
                )}
            ]}]
        )
        raw = response.content[0].text.strip()
        if '```' in raw:
            raw = raw.split('```')[1]
            if raw.startswith('json'): raw = raw[4:]
        raw = raw.strip()
        parsed = json.loads(raw)
        amount = float(parsed.get('amount', 0))
        if amount <= 0:
            return jsonify({'msg': 'Could not read a total amount from the receipt'}), 400
        valid_cats = ['Food','Transport','Shopping','Entertainment','Bills','Gift Cards','Other']
        cat = parsed.get('category', 'Other')
        return jsonify({
            'amount': round(amount, 2),
            'description': str(parsed.get('description', 'Receipt'))[:255],
            'category': cat if cat in valid_cats else 'Other'
        }), 200
    except anthropic.AuthenticationError:
        return jsonify({'msg': 'API key missing or invalid.'}), 500
    except json.JSONDecodeError as e:
        return jsonify({'msg': 'Could not parse receipt data'}), 400
    except Exception as e:
        print(f"Receipt scan error: {type(e).__name__}: {str(e)}")
        return jsonify({'msg': f'Scan error: {str(e)}'}), 400


# ====================== MONTHLY REPORT ENDPOINT ======================
@app.route('/generate-report', methods=['POST'])
@jwt_required()
def generate_report():
    try:
        user_id = int(get_jwt_identity())
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'msg': 'User not found'}), 404
        all_expenses = Expense.query.filter_by(user_id=user_id).all()
        if not all_expenses:
            return jsonify({'msg': 'No expenses found to generate a report'}), 400
        now = datetime.now(timezone.utc)
        target_expenses = [e for e in all_expenses if e.date.month == now.month and e.date.year == now.year]
        report_label = now.strftime("%B %Y")
        if not target_expenses:
            return jsonify({'msg': f'No expenses found for {report_label}'}), 400
        total = sum(e.amount for e in target_expenses)
        category_totals = {}
        for e in target_expenses:
            category_totals[e.category] = category_totals.get(e.category, 0) + e.amount
        top_categories = sorted(category_totals.items(), key=lambda x: x[1], reverse=True)
        if now.month == 1:
            prev_m, prev_y = 12, now.year - 1
        else:
            prev_m, prev_y = now.month - 1, now.year
        prev_expenses = [e for e in all_expenses if e.date.month == prev_m and e.date.year == prev_y]
        prev_total = sum(e.amount for e in prev_expenses)
        mom_pct = ((total - prev_total) / prev_total * 100) if prev_total > 0 else None
        unique_days = len(set(e.date.day for e in target_expenses))
        avg_daily = total / max(unique_days, 1)
        top_expenses = sorted(target_expenses, key=lambda e: e.amount, reverse=True)[:3]
        cat_lines = "\n".join(f"  - {cat}: ${amt:.2f} ({amt/total*100:.1f}%)" for cat, amt in top_categories)
        top_lines = "\n".join(f"  - {e.description}: ${e.amount:.2f} ({e.category})" for e in top_expenses)
        mom_text = f"{mom_pct:+.1f}% vs last month (${prev_total:.2f})" if mom_pct is not None else "No previous month data"
        prompt = (
            f"You are a personal financial coach. Generate a clear, friendly monthly financial report for {user.username}.\n\n"
            f"SPENDING DATA FOR {report_label}:\n"
            f"- Total spent: ${total:.2f}\n"
            f"- Month-over-month: {mom_text}\n"
            f"- Average daily spend: ${avg_daily:.2f}\n"
            f"- Number of transactions: {len(target_expenses)}\n\n"
            f"Category breakdown:\n{cat_lines}\n\n"
            f"Top 3 largest expenses:\n{top_lines}\n\n"
            "Generate a report with EXACTLY these sections:\n\n"
            "## Executive Summary\n2-3 sentences giving the overall picture.\n\n"
            "## Category Analysis\nOne sentence per category.\n\n"
            "## Key Insights\n3 bullet points of genuine insights.\n\n"
            "## Recommendations\n3 specific actionable recommendations with estimated monthly savings.\n\n"
            "## Savings Projection\nShort motivational paragraph with concrete annual savings numbers.\n\n"
            "Keep the tone warm and coach-like."
        )
        client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
        response = client.messages.create(
            model='claude-opus-4-5', max_tokens=1500,
            messages=[{'role': 'user', 'content': prompt}]
        )
        narrative = response.content[0].text if response.content else ''
        return jsonify({
            'report_label': report_label, 'username': user.username,
            'total': round(total, 2), 'prev_total': round(prev_total, 2),
            'mom_pct': round(mom_pct, 1) if mom_pct is not None else None,
            'avg_daily': round(avg_daily, 2), 'tx_count': len(target_expenses),
            'category_totals': dict(top_categories),
            'top_expenses': [{'description': e.description, 'amount': e.amount, 'category': e.category} for e in top_expenses],
            'narrative': narrative, 'generated_at': now.isoformat(),
        }), 200
    except anthropic.AuthenticationError:
        return jsonify({'msg': 'API key missing or invalid.'}), 500
    except Exception as e:
        print(f"Report error: {str(e)}")
        return jsonify({'msg': f'Report error: {str(e)}'}), 500


# ====================== HOUSEHOLD ENDPOINTS ======================
import secrets as _sec

def _user_household(user_id):
    """Return the household this user belongs to, or None."""
    mem = HouseholdMember.query.filter_by(user_id=user_id).first()
    return mem.household if mem else None

@app.route('/household', methods=['GET'])
@jwt_required()
def get_household():
    user_id = int(get_jwt_identity())
    hh = _user_household(user_id)
    if not hh:
        return jsonify({'household': None}), 200
    members = [{
        'user_id':   m.user_id,
        'username':  m.user.username,
        'role':      m.role,
        'joined_at': m.joined_at.isoformat(),
    } for m in hh.members]
    return jsonify({
        'household': {
            'id':          hh.id,
            'name':        hh.name,
            'invite_code': hh.invite_code,
            'owner_id':    hh.owner_id,
            'members':     members,
        }
    }), 200

@app.route('/household/create', methods=['POST'])
@jwt_required()
def create_household():
    user_id = int(get_jwt_identity())
    if _user_household(user_id):
        return jsonify({'msg': 'You are already in a household. Leave it first.'}), 400
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'msg': 'Household name is required'}), 400
    code = _sec.token_hex(4).upper()   # e.g. "A3F8B2C1"
    hh = Household(name=name, invite_code=code, owner_id=user_id)
    db.session.add(hh)
    db.session.flush()   # get hh.id before commit
    mem = HouseholdMember(household_id=hh.id, user_id=user_id, role='owner')
    db.session.add(mem)
    db.session.commit()
    return jsonify({
        'msg':         'Household created',
        'invite_code': code,
        'household_id': hh.id,
    }), 201

@app.route('/household/join', methods=['POST'])
@jwt_required()
def join_household():
    user_id = int(get_jwt_identity())
    if _user_household(user_id):
        return jsonify({'msg': 'You are already in a household. Leave it first.'}), 400
    data = request.get_json() or {}
    code = (data.get('invite_code') or '').strip().upper()
    if not code:
        return jsonify({'msg': 'Invite code is required'}), 400
    hh = Household.query.filter_by(invite_code=code).first()
    if not hh:
        return jsonify({'msg': 'Invalid invite code'}), 404
    mem = HouseholdMember(household_id=hh.id, user_id=user_id, role='member')
    db.session.add(mem)
    db.session.commit()
    return jsonify({'msg': f'Joined household: {hh.name}', 'household_id': hh.id}), 200

@app.route('/household/leave', methods=['POST'])
@jwt_required()
def leave_household():
    user_id = int(get_jwt_identity())
    mem = HouseholdMember.query.filter_by(user_id=user_id).first()
    if not mem:
        return jsonify({'msg': 'You are not in a household'}), 400
    hh = mem.household
    # If owner leaves, dissolve household entirely
    if hh.owner_id == user_id:
        db.session.delete(hh)
    else:
        db.session.delete(mem)
    db.session.commit()
    return jsonify({'msg': 'Left household'}), 200

@app.route('/household/expenses', methods=['GET'])
@jwt_required()
def get_household_expenses():
    user_id = int(get_jwt_identity())
    hh = _user_household(user_id)
    if not hh:
        return jsonify({'msg': 'Not in a household'}), 400
    member_ids = [m.user_id for m in hh.members]
    member_names = {m.user_id: m.user.username for m in hh.members}
    expenses = Expense.query.filter(Expense.user_id.in_(member_ids)).order_by(Expense.date.desc()).all()
    return jsonify([{
        'id':          e.id,
        'amount':      e.amount,
        'description': e.description,
        'category':    e.category,
        'date':        e.date.isoformat(),
        'user_id':     e.user_id,
        'username':    member_names.get(e.user_id, 'Unknown'),
        'is_mine':     e.user_id == user_id,
    } for e in expenses]), 200

@app.route('/household/summary', methods=['GET'])
@jwt_required()
def get_household_summary():
    user_id = int(get_jwt_identity())
    hh = _user_household(user_id)
    if not hh:
        return jsonify({'msg': 'Not in a household'}), 400
    member_ids = [m.user_id for m in hh.members]
    member_names = {m.user_id: m.user.username for m in hh.members}
    expenses = Expense.query.filter(Expense.user_id.in_(member_ids)).all()
    total = sum(e.amount for e in expenses)
    per_member = {}
    for mid in member_ids:
        spent = sum(e.amount for e in expenses if e.user_id == mid)
        per_member[member_names[mid]] = round(spent, 2)
    fair_share = round(total / max(len(member_ids), 1), 2)
    balances = {name: round(fair_share - spent, 2) for name, spent in per_member.items()}
    return jsonify({
        'household_name': hh.name,
        'total':          round(total, 2),
        'member_count':   len(member_ids),
        'fair_share':     fair_share,
        'per_member':     per_member,
        'balances':       balances,   # positive = owes, negative = owed
    }), 200


# ====================== EXPORT TO ACCOUNTANT ======================
# ====================== EXPORT TO ACCOUNTANT ======================
@app.route('/export-tax', methods=['POST'])
@jwt_required()
def export_tax():
    try:
        user_id  = int(get_jwt_identity())
        user     = db.session.get(User, user_id)
        if not user:
            return jsonify({'msg': 'User not found'}), 404

        data      = request.get_json() or {}
        year      = int(data.get('year', datetime.now(timezone.utc).year))
        full_name   = (data.get('full_name') or user.username).strip()
        fmt         = data.get('format', 'html').lower()   # 'pdf' or 'html'

        expenses = Expense.query.filter(
            Expense.user_id == user_id,
            db.extract('year', Expense.date) == year
        ).order_by(Expense.date).all()

        if not expenses:
            return jsonify({'msg': f'No expenses found for {year}'}), 400

        total     = sum(e.amount for e in expenses)
        monthly   = {}
        for e in expenses:
            key = e.date.strftime('%B')
            monthly[key] = monthly.get(key, 0) + e.amount

        cat_totals = {}
        for e in expenses:
            cat_totals[e.category] = cat_totals.get(e.category, 0) + e.amount
        cat_sorted = sorted(cat_totals.items(), key=lambda x: x[1], reverse=True)

        cat_lines = '\n'.join('  - {}: ${:.2f}'.format(c, a) for c, a in cat_sorted)
        prompt = (
            'Write a brief professional financial summary for {} for the tax year {}.\n\n'
            'Total annual expenditure: ${:.2f}\n'
            'Number of transactions: {}\n'
            'Category breakdown:\n{}\n\n'
            'Write 2-3 sentences suitable for an accountant or tax professional. '
            'Be factual, formal, and concise. Note any notable spending patterns. '
            'Do not give tax advice.'
        ).format(full_name, year, total, len(expenses), cat_lines)

        client     = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
        resp       = client.messages.create(
            model='claude-opus-4-5', max_tokens=300,
            messages=[{'role': 'user', 'content': prompt}]
        )
        ai_summary = resp.content[0].text.strip() if resp.content else ''

        month_order = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December']
        cat_colors  = {
            'Food':'#f97316','Transport':'#3b82f6','Shopping':'#a855f7',
            'Entertainment':'#ec4899','Bills':'#ef4444','Gift Cards':'#10b981','Other':'#6b7280'
        }
        generated = datetime.now(timezone.utc).strftime('%d %B %Y at %H:%M UTC')  # timezone-aware

        # ── Monthly rows ──
        monthly_rows = ''
        running = 0
        for m in month_order:
            if m in monthly:
                running += monthly[m]
                monthly_rows += (
                    '<tr><td>{}</td>'
                    '<td class="num">${:,.2f}</td>'
                    '<td class="num">${:,.2f}</td>'
                    '<td class="num">{}%</td></tr>'
                ).format(m, monthly[m], running, round(monthly[m]/total*100, 1))

        # ── Category rows ──
        cat_rows = ''
        for cat, amt in cat_sorted:
            col = cat_colors.get(cat, '#6b7280')
            pct = round(amt / total * 100, 1)
            cat_rows += (
                '<tr><td><span class="dot" style="background:{}"></span>{}</td>'
                '<td class="num">${:,.2f}</td>'
                '<td class="num">{}%</td></tr>'
            ).format(col, cat, amt, pct)

        # ── Expense ledger rows ──
        expense_rows = ''
        for i, e in enumerate(expenses):
            row_class = 'alt' if i % 2 == 0 else ''
            col = cat_colors.get(e.category, '#6b7280')
            expense_rows += (
                '<tr class="{}"><td>{}</td><td>{}</td>'
                '<td><span class="badge" style="color:{}">{}</span></td>'
                '<td class="num">${:,.2f}</td></tr>'
            ).format(
                row_class,
                e.date.strftime('%d %b %Y'),
                e.description,
                col, e.category,
                e.amount
            )

        html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Tax Report {year} &mdash; {name}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Outfit:wght@700;800&display=swap');
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#1e1e2e;background:#fff;font-size:13px}}
.cover{{background:linear-gradient(135deg,#1a1060,#2d1b8e);color:#fff;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between}}
.cover-brand{{font-family:'Outfit',sans-serif;font-size:1rem;font-weight:800;opacity:.6;letter-spacing:.1em;text-transform:uppercase;margin-bottom:28px}}
.cover-title{{font-family:'Outfit',sans-serif;font-size:2.4rem;font-weight:800;letter-spacing:-.02em;line-height:1.1}}
.cover-sub{{opacity:.6;font-size:.9rem;margin-top:8px}}
.cover-meta{{display:flex;gap:48px;margin-top:36px;border-top:1px solid rgba(255,255,255,.15);padding-top:22px}}
.cover-meta label{{display:block;font-size:.62rem;text-transform:uppercase;letter-spacing:.12em;opacity:.45;margin-bottom:4px}}
.cover-meta span{{font-family:'Outfit',sans-serif;font-size:1.1rem;font-weight:800}}
.page{{padding:48px 72px}}
.section{{margin-bottom:42px}}
.section-title{{font-family:'Outfit',sans-serif;font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.14em;color:#6366f1;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #eef2ff}}
.summary-box{{background:#eef2ff;border-left:4px solid #6366f1;border-radius:0 10px 10px 0;padding:16px 20px;color:#334155;line-height:1.7;font-size:.875rem}}
.stat-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:30px}}
.stat-card{{background:#f8f9fc;border:1px solid #e8eaf2;border-radius:10px;padding:14px 16px}}
.stat-card label{{display:block;font-size:.62rem;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;font-weight:600;margin-bottom:5px}}
.stat-card span{{font-family:'Outfit',sans-serif;font-size:1.4rem;font-weight:800;color:#6366f1}}
table{{width:100%;border-collapse:collapse;font-size:.84rem}}
th{{background:#f8f9fc;padding:10px 14px;text-align:left;font-size:.67rem;text-transform:uppercase;letter-spacing:.09em;color:#94a3b8;font-weight:700;border-bottom:1.5px solid #e8eaf2}}
td{{padding:10px 14px;border-bottom:1px solid #f1f3f9;vertical-align:middle}}
tr.alt td{{background:#fafbff}}
.num{{text-align:right;font-family:'Outfit',sans-serif;font-weight:700}}
tfoot td{{font-weight:700;border-top:2px solid #6366f1;padding-top:12px;color:#6366f1;font-family:'Outfit',sans-serif}}
.badge{{font-weight:600;font-size:.72rem}}
.dot{{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;vertical-align:middle}}
.footer{{margin-top:44px;padding-top:14px;border-top:1px solid #e8eaf2;display:flex;justify-content:space-between;color:#94a3b8;font-size:.7rem}}
@media print{{
  .cover{{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  .summary-box{{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  th{{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  tr.alt td{{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  @page{{margin:0}}
}}
</style>
</head>
<body>
<div class="cover">
  <div class="cover-brand">&#128176; FinanceAI</div>
  <div>
    <div class="cover-title">Annual Expense Report<br/>Tax Year {year}</div>
    <div class="cover-sub">Prepared for {name}</div>
  </div>
  <div class="cover-meta">
    <div><label>Total Expenditure</label><span>${total}</span></div>
    <div><label>Transactions</label><span>{tx_count}</span></div>
    <div><label>Categories</label><span>{cat_count}</span></div>
    <div><label>Generated</label><span style="font-size:.82rem">{generated}</span></div>
  </div>
</div>
<div class="page">
  <div class="section">
    <div class="section-title">Executive Summary</div>
    <div class="summary-box">{ai_summary}</div>
  </div>
  <div class="section">
    <div class="section-title">Monthly Breakdown</div>
    <table>
      <thead><tr><th>Month</th><th class="num">Monthly Total</th><th class="num">Running Total</th><th class="num">% of Annual</th></tr></thead>
      <tbody>{monthly_rows}</tbody>
      <tfoot><tr><td><strong>Annual Total</strong></td><td class="num">${total}</td><td class="num">${total}</td><td class="num">100%</td></tr></tfoot>
    </table>
  </div>
  <div class="section">
    <div class="section-title">Category Summary</div>
    <table>
      <thead><tr><th>Category</th><th class="num">Annual Total</th><th class="num">% of Spend</th></tr></thead>
      <tbody>{cat_rows}</tbody>
      <tfoot><tr><td><strong>Total</strong></td><td class="num">${total}</td><td class="num">100%</td></tr></tfoot>
    </table>
  </div>
  <div class="section">
    <div class="section-title">Complete Expense Ledger ({tx_count} transactions)</div>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th></tr></thead>
      <tbody>{expense_rows}</tbody>
      <tfoot><tr><td colspan="3"><strong>Annual Total</strong></td><td class="num">${total}</td></tr></tfoot>
    </table>
  </div>
  <div class="footer">
    <span>FinanceAI &middot; Annual Expense Report &middot; Tax Year {year} &middot; {name}</span>
    <span>Generated {generated} &middot; Confidential</span>
  </div>
</div>
</body>
</html>""".format(
            year=year, name=full_name,
            total='{:,.2f}'.format(total),
            tx_count=len(expenses),
            cat_count=len(cat_sorted),
            generated=generated,
            ai_summary=ai_summary,
            monthly_rows=monthly_rows,
            cat_rows=cat_rows,
            expense_rows=expense_rows,
        )

        if fmt == 'pdf':
            try:
                from reportlab.lib.pagesizes import A4
                from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
                from reportlab.lib.units import mm
                from reportlab.lib import colors
                from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                                Table, TableStyle, HRFlowable)
                from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
                import io

                buf = io.BytesIO()
                doc = SimpleDocTemplate(buf, pagesize=A4,
                                        leftMargin=20*mm, rightMargin=20*mm,
                                        topMargin=18*mm, bottomMargin=18*mm)

                styles = getSampleStyleSheet()
                INDIGO   = colors.HexColor('#6366f1')
                DARK     = colors.HexColor('#1e1e2e')
                MUTED    = colors.HexColor('#64748b')
                FAINT    = colors.HexColor('#94a3b8')
                LIGHT_BG = colors.HexColor('#f8f9fc')
                INDIGO_BG= colors.HexColor('#eef2ff')

                def sty(name, **kw):
                    s = styles[name].clone(name + '_custom')
                    for k, v in kw.items():
                        setattr(s, k, v)
                    return s

                title_sty   = sty('Title',   fontSize=22, textColor=DARK,    spaceAfter=4)
                sub_sty     = sty('Normal',  fontSize=11, textColor=MUTED,   spaceAfter=14)
                head_sty    = sty('Heading2',fontSize=8,  textColor=INDIGO,  spaceBefore=14, spaceAfter=6, fontName='Helvetica-Bold')
                body_sty    = sty('Normal',  fontSize=9,  textColor=DARK,    leading=14)
                sum_sty     = sty('Normal',  fontSize=9,  textColor=colors.HexColor('#334155'), leading=15, backColor=INDIGO_BG)
                small_sty   = sty('Normal',  fontSize=7,  textColor=FAINT)

                story = []

                # ── Cover ──
                story.append(Spacer(1, 8*mm))
                story.append(Paragraph('&#128176; FinanceAI', sty('Normal', fontSize=9, textColor=FAINT, fontName='Helvetica-Bold')))
                story.append(Spacer(1, 4*mm))
                story.append(Paragraph('Annual Expense Report', title_sty))
                story.append(Paragraph('Tax Year {}'.format(year), sty('Normal', fontSize=16, textColor=INDIGO, fontName='Helvetica-Bold', spaceAfter=4)))
                story.append(Paragraph('Prepared for {}'.format(full_name), sub_sty))
                story.append(HRFlowable(width='100%', thickness=2, color=INDIGO, spaceAfter=10))

                # ── Cover stats ──
                cover_data = [
                    ['Total Expenditure', 'Transactions', 'Categories', 'Generated'],
                    ['${:,.2f}'.format(total), str(len(expenses)), str(len(cat_sorted)), generated],
                ]
                cover_tbl = Table(cover_data, colWidths=[42*mm, 38*mm, 38*mm, 52*mm])
                cover_tbl.setStyle(TableStyle([
                    ('BACKGROUND',  (0,0), (-1,0), LIGHT_BG),
                    ('TEXTCOLOR',   (0,0), (-1,0), FAINT),
                    ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
                    ('FONTSIZE',    (0,0), (-1,0), 7),
                    ('FONTNAME',    (0,1), (-1,1), 'Helvetica-Bold'),
                    ('FONTSIZE',    (0,1), (-1,1), 11),
                    ('TEXTCOLOR',   (0,1), (-1,1), INDIGO),
                    ('ALIGN',       (0,0), (-1,-1), 'CENTER'),
                    ('VALIGN',      (0,0), (-1,-1), 'MIDDLE'),
                    ('ROWBACKGROUNDS', (0,0), (-1,-1), [LIGHT_BG, colors.white]),
                    ('BOX',         (0,0), (-1,-1), 0.5, colors.HexColor('#e8eaf2')),
                    ('INNERGRID',   (0,0), (-1,-1), 0.5, colors.HexColor('#e8eaf2')),
                    ('TOPPADDING',  (0,0), (-1,-1), 6),
                    ('BOTTOMPADDING',(0,0),(-1,-1), 6),
                ]))
                story.append(cover_tbl)
                story.append(Spacer(1, 8*mm))

                # ── AI Summary ──
                story.append(Paragraph('EXECUTIVE SUMMARY', head_sty))
                story.append(Paragraph(ai_summary, sty('Normal', fontSize=9, textColor=colors.HexColor('#334155'), leading=15, backColor=INDIGO_BG, leftIndent=8, borderPadding=8)))
                story.append(Spacer(1, 6*mm))

                # ── Monthly breakdown ──
                story.append(Paragraph('MONTHLY BREAKDOWN', head_sty))
                month_order2 = ['January','February','March','April','May','June',
                                'July','August','September','October','November','December']
                mdata = [['Month','Monthly Total','Running Total','% of Annual']]
                running2 = 0
                for m in month_order2:
                    if m in monthly:
                        running2 += monthly[m]
                        mdata.append([m,
                            '${:,.2f}'.format(monthly[m]),
                            '${:,.2f}'.format(running2),
                            '{}%'.format(round(monthly[m]/total*100,1))])
                mdata.append(['Annual Total', '${:,.2f}'.format(total), '${:,.2f}'.format(total), '100%'])
                mtbl = Table(mdata, colWidths=[50*mm, 42*mm, 42*mm, 36*mm])
                mtbl.setStyle(TableStyle([
                    ('BACKGROUND',  (0,0), (-1,0), LIGHT_BG),
                    ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
                    ('FONTSIZE',    (0,0), (-1,-1), 8),
                    ('ALIGN',       (1,0), (-1,-1), 'RIGHT'),
                    ('TEXTCOLOR',   (0,0), (-1,0), FAINT),
                    ('ROWBACKGROUNDS',(0,1),(-1,-2),[colors.white, LIGHT_BG]),
                    ('FONTNAME',    (0,-1),(-1,-1), 'Helvetica-Bold'),
                    ('TEXTCOLOR',   (0,-1),(-1,-1), INDIGO),
                    ('LINEABOVE',   (0,-1),(-1,-1), 1, INDIGO),
                    ('BOX',         (0,0), (-1,-1), 0.5, colors.HexColor('#e8eaf2')),
                    ('INNERGRID',   (0,0), (-1,-1), 0.3, colors.HexColor('#e8eaf2')),
                    ('TOPPADDING',  (0,0), (-1,-1), 5),
                    ('BOTTOMPADDING',(0,0),(-1,-1), 5),
                ]))
                story.append(mtbl)
                story.append(Spacer(1, 6*mm))

                # ── Category summary ──
                story.append(Paragraph('CATEGORY SUMMARY', head_sty))
                cdata = [['Category', 'Annual Total', '% of Spend']]
                for cat, amt in cat_sorted:
                    cdata.append([cat, '${:,.2f}'.format(amt), '{}%'.format(round(amt/total*100,1))])
                cdata.append(['Total', '${:,.2f}'.format(total), '100%'])
                ctbl = Table(cdata, colWidths=[80*mm, 55*mm, 35*mm])
                ctbl.setStyle(TableStyle([
                    ('BACKGROUND',  (0,0), (-1,0), LIGHT_BG),
                    ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
                    ('FONTSIZE',    (0,0), (-1,-1), 8),
                    ('ALIGN',       (1,0), (-1,-1), 'RIGHT'),
                    ('TEXTCOLOR',   (0,0), (-1,0), FAINT),
                    ('ROWBACKGROUNDS',(0,1),(-1,-2),[colors.white, LIGHT_BG]),
                    ('FONTNAME',    (0,-1),(-1,-1), 'Helvetica-Bold'),
                    ('TEXTCOLOR',   (0,-1),(-1,-1), INDIGO),
                    ('LINEABOVE',   (0,-1),(-1,-1), 1, INDIGO),
                    ('BOX',         (0,0), (-1,-1), 0.5, colors.HexColor('#e8eaf2')),
                    ('INNERGRID',   (0,0), (-1,-1), 0.3, colors.HexColor('#e8eaf2')),
                    ('TOPPADDING',  (0,0), (-1,-1), 5),
                    ('BOTTOMPADDING',(0,0),(-1,-1), 5),
                ]))
                story.append(ctbl)
                story.append(Spacer(1, 6*mm))

                # ── Full expense ledger ──
                story.append(Paragraph('COMPLETE EXPENSE LEDGER ({} transactions)'.format(len(expenses)), head_sty))
                edata = [['Date', 'Description', 'Category', 'Amount']]
                for e in expenses:
                    edata.append([
                        e.date.strftime('%d %b %Y'),
                        e.description[:45] + ('...' if len(e.description) > 45 else ''),
                        e.category,
                        '${:,.2f}'.format(e.amount)
                    ])
                edata.append(['', 'Annual Total', '', '${:,.2f}'.format(total)])
                etbl = Table(edata, colWidths=[28*mm, 82*mm, 32*mm, 28*mm])
                etbl.setStyle(TableStyle([
                    ('BACKGROUND',  (0,0), (-1,0), LIGHT_BG),
                    ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
                    ('FONTSIZE',    (0,0), (-1,-1), 7.5),
                    ('ALIGN',       (3,0), (3,-1), 'RIGHT'),
                    ('TEXTCOLOR',   (0,0), (-1,0), FAINT),
                    ('ROWBACKGROUNDS',(0,1),(-1,-2),[colors.white, LIGHT_BG]),
                    ('FONTNAME',    (0,-1),(-1,-1), 'Helvetica-Bold'),
                    ('TEXTCOLOR',   (1,-1),(3,-1), INDIGO),
                    ('LINEABOVE',   (0,-1),(-1,-1), 1, INDIGO),
                    ('BOX',         (0,0), (-1,-1), 0.5, colors.HexColor('#e8eaf2')),
                    ('INNERGRID',   (0,0), (-1,-1), 0.3, colors.HexColor('#e8eaf2')),
                    ('TOPPADDING',  (0,0), (-1,-1), 4),
                    ('BOTTOMPADDING',(0,0),(-1,-1), 4),
                ]))
                story.append(etbl)
                story.append(Spacer(1, 8*mm))

                # ── Footer ──
                story.append(HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#e8eaf2'), spaceAfter=6))
                story.append(Paragraph(
                    'FinanceAI &middot; Annual Expense Report &middot; Tax Year {} &middot; {} &middot; Generated {} &middot; Confidential'.format(year, full_name, generated),
                    sty('Normal', fontSize=6.5, textColor=FAINT, alignment=TA_CENTER)
                ))

                doc.build(story)
                pdf_bytes = buf.getvalue()

                return Response(
                    pdf_bytes,
                    mimetype='application/pdf',
                    headers={
                        'Content-Disposition': 'attachment; filename="TaxReport_{}_{}.pdf"'.format(year, user.username)
                    }
                )
            except ImportError:
                return jsonify({'msg': 'PDF generation requires reportlab. Run: pip install reportlab'}), 500
            except Exception as pdf_err:
                print('PDF error: {}'.format(str(pdf_err)))
                return jsonify({'msg': 'PDF error: {}'.format(str(pdf_err))}), 500
        else:
            return Response(
                html,
                mimetype='text/html',
                headers={
                    'Content-Disposition': 'attachment; filename="TaxReport_{}_{}.html"'.format(year, user.username)
                }
            )

    except anthropic.AuthenticationError:
        return jsonify({'msg': 'API key missing or invalid.'}), 500
    except Exception as e:
        print('Tax export error: {}'.format(str(e)))
        return jsonify({'msg': 'Export error: {}'.format(str(e))}), 500



# ====================== CREATE TABLES ======================
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True)