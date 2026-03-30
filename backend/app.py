from flask import Flask, request, jsonify
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os
import json
import anthropic
from flask_mail import Mail, Message

# ====================== HYBRID ML + KEYWORD BOOST ======================
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
import pickle

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_FILE = os.path.join(BASE_DIR, 'category_model.pkl')

keyword_map = {
    "pizza": "Food", "starbucks": "Food", "coffee": "Food",
    "uber": "Transport", "lyft": "Transport", "bus": "Transport", "taxi": "Transport",
    "netflix": "Entertainment", "spotify": "Entertainment", "hulu": "Entertainment",
    "amazon": "Shopping", "target": "Shopping", "walmart": "Shopping",
    "rent": "Bills", "electricity": "Bills", "internet": "Bills",
    "gift": "Gift Cards"
}

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

# ── Flask-Mail config (set these in your .env) ──────────────────────
app.config['MAIL_SERVER']   = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
app.config['MAIL_PORT']     = int(os.getenv('MAIL_PORT', 587))
app.config['MAIL_USE_TLS']  = os.getenv('MAIL_USE_TLS', 'true').lower() == 'true'
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')   # your Gmail address
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')   # your Gmail App Password
app.config['MAIL_DEFAULT_SENDER'] = os.getenv('MAIL_DEFAULT_SENDER', os.getenv('MAIL_USERNAME'))

db = SQLAlchemy(app)
jwt = JWTManager(app)
mail = Mail(app)

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
        'id': e.id, 'amount': e.amount, 'description': e.description,
        'category': e.category, 'date': e.date.isoformat()
    } for e in expenses]), 200

@app.route('/expenses', methods=['POST'])
@jwt_required()
def add_expense():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    if not data or not data.get('amount'):
        return jsonify({'msg': 'Amount required'}), 400
    new_exp = Expense(
        amount=data['amount'], description=data.get('description'),
        category=data.get('category', 'Other'), user_id=user_id
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
        for keyword, cat in keyword_map.items():
            if keyword in description:
                return jsonify({'category': cat, 'confidence': 0.95}), 200
        X_new = vectorizer.transform([description])
        predicted = model.predict(X_new)[0]
        proba = model.predict_proba(X_new)[0]
        confidence = float(max(proba))
        return jsonify({'category': predicted, 'confidence': round(confidence, 4)}), 200
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
            description=data.get('description'), predicted=data.get('predicted'),
            actual=data.get('actual'), user_id=user_id
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
        context = data.get('context', '')
        client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
        response = client.messages.create(
            model='claude-opus-4-5',
            max_tokens=1024,
            system=(
                f"You are a helpful personal finance assistant embedded in a finance tracking app. "
                f"Be concise, friendly, and give practical actionable advice. "
                f"User spending context: {context} "
                f"Keep responses under 120 words unless detail is genuinely needed."
            ),
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
            model='claude-opus-4-5',
            max_tokens=200,
            messages=[{'role': 'user', 'content': prompt}]
        )

        raw = response.content[0].text.strip()
        # Strip markdown fences if present
        if '```' in raw:
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        raw = raw.strip()

        parsed = json.loads(raw)
        amount = float(parsed.get('amount', 0))

        if amount <= 0:
            return jsonify({'msg': 'Could not detect an amount. Try: "Coffee $4.50"'}), 400

        valid_cats = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Gift Cards', 'Other']
        cat = parsed.get('category', 'Other')
        return jsonify({
            'amount': round(amount, 2),
            'description': str(parsed.get('description', text))[:255],
            'category': cat if cat in valid_cats else 'Other'
        }), 200

    except anthropic.AuthenticationError:
        return jsonify({'msg': 'API key missing or invalid.'}), 500
    except json.JSONDecodeError as e:
        print(f"Parse JSON error: {str(e)}, raw response: {raw if 'raw' in dir() else 'N/A'}")
        return jsonify({'msg': f'JSON parse error: {str(e)}'}), 400
    except Exception as e:
        print(f"Parse expense error: {type(e).__name__}: {str(e)}")
        return jsonify({'msg': f'Parse error: {type(e).__name__}: {str(e)}'}), 400

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

        now = datetime.utcnow()
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
            "## Category Analysis\nOne sentence per category explaining what the spending suggests.\n\n"
            "## Key Insights\n3 bullet points of genuine insights.\n\n"
            "## Recommendations\n3 specific actionable recommendations with estimated monthly savings.\n\n"
            "## Savings Projection\nShort motivational paragraph with concrete annual savings numbers.\n\n"
            "Keep the tone warm and coach-like."
        )

        client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
        response = client.messages.create(
            model='claude-opus-4-5',
            max_tokens=1500,
            messages=[{'role': 'user', 'content': prompt}]
        )
        narrative = response.content[0].text if response.content else ''

        return jsonify({
            'report_label': report_label,
            'username': user.username,
            'total': round(total, 2),
            'prev_total': round(prev_total, 2),
            'mom_pct': round(mom_pct, 1) if mom_pct is not None else None,
            'avg_daily': round(avg_daily, 2),
            'tx_count': len(target_expenses),
            'category_totals': dict(top_categories),
            'top_expenses': [{'description': e.description, 'amount': e.amount, 'category': e.category} for e in top_expenses],
            'narrative': narrative,
            'generated_at': now.isoformat(),
        }), 200

    except anthropic.AuthenticationError:
        return jsonify({'msg': 'API key missing or invalid. Set ANTHROPIC_API_KEY in your .env file.'}), 500
    except Exception as e:
        print(f"Report error: {str(e)}")
        return jsonify({'msg': f'Report error: {str(e)}'}), 500

# ====================== CREATE TABLES ======================
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True)

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
            model='claude-opus-4-5',
            max_tokens=300,
            messages=[{
                'role': 'user',
                'content': [
                    {
                        'type': 'image',
                        'source': {
                            'type': 'base64',
                            'media_type': media_type,
                            'data': image_b64,
                        }
                    },
                    {
                        'type': 'text',
                        'text': (
                            'Extract the expense details from this receipt image.\n'
                            'Return ONLY a JSON object with exactly these fields, no markdown:\n'
                            '{"amount": <total amount as number>, "description": "<merchant or item name, concise>", '
                            '"category": "<one of: Food, Transport, Shopping, Entertainment, Bills, Gift Cards, Other>"}\n'
                            'Use the total/grand total amount. If unclear, use the largest amount shown.'
                        )
                    }
                ]
            }]
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
            return jsonify({'msg': 'Could not read a total amount from the receipt'}), 400

        valid_cats = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Gift Cards', 'Other']
        cat = parsed.get('category', 'Other')
        return jsonify({
            'amount': round(amount, 2),
            'description': str(parsed.get('description', 'Receipt'))[:255],
            'category': cat if cat in valid_cats else 'Other'
        }), 200

    except anthropic.AuthenticationError:
        return jsonify({'msg': 'API key missing or invalid.'}), 500
    except json.JSONDecodeError as e:
        print(f"Receipt JSON error: {str(e)}")
        return jsonify({'msg': 'Could not parse receipt data'}), 400
    except Exception as e:
        print(f"Receipt scan error: {type(e).__name__}: {str(e)}")
        return jsonify({'msg': f'Scan error: {str(e)}'}), 400


# ====================== EMAIL DIGEST SUBSCRIPTION ======================
@app.route('/subscribe-digest', methods=['POST'])
@jwt_required()
def subscribe_digest():
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json()
        email = (data.get('email') or '').strip()
        if not email or '@' not in email:
            return jsonify({'msg': 'Valid email required'}), 400

        # Store email on the user record (add email_digest column if not exists)
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'msg': 'User not found'}), 404

        # We store the digest email in a simple way — using a JSON sidecar file per user
        digest_file = os.path.join(BASE_DIR, 'digest_subscribers.json')
        try:
            with open(digest_file, 'r') as f:
                subscribers = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            subscribers = {}

        subscribers[str(user_id)] = {
            'email': email,
            'username': user.username,
            'subscribed_at': datetime.utcnow().isoformat()
        }

        with open(digest_file, 'w') as f:
            json.dump(subscribers, f, indent=2)

        print(f"✅ Digest subscriber added: {email} (user {user_id})")
        return jsonify({'msg': 'Subscribed successfully', 'email': email}), 200

    except Exception as e:
        print(f"Digest subscribe error: {str(e)}")
        return jsonify({'msg': f'Subscription error: {str(e)}'}), 500


# ====================== SEND WEEKLY DIGEST (call via cron/scheduler) ======================
@app.route('/send-digest', methods=['POST'])
def send_weekly_digest():
    """
    Call this endpoint weekly via a cron job or scheduler.
    Example cron (every Monday 8am): 0 8 * * 1 curl -X POST http://localhost:5000/send-digest
    Requires: pip install flask-mail  +  MAIL_* vars in .env
    """
    try:
        digest_file = os.path.join(BASE_DIR, 'digest_subscribers.json')
        if not os.path.exists(digest_file):
            return jsonify({'msg': 'No subscribers yet'}), 200

        with open(digest_file, 'r') as f:
            subscribers = json.load(f)

        if not subscribers:
            return jsonify({'msg': 'No subscribers'}), 200

        client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
        sent = []

        for user_id_str, sub in subscribers.items():
            try:
                user_id = int(user_id_str)
                now = datetime.utcnow()
                week_start = now - timedelta(days=7)

                expenses = Expense.query.filter(
                    Expense.user_id == user_id,
                    Expense.date >= week_start
                ).all()

                if not expenses:
                    continue

                total = sum(e.amount for e in expenses)
                cat_totals = {}
                for e in expenses:
                    cat_totals[e.category] = cat_totals.get(e.category, 0) + e.amount
                top_cat = max(cat_totals, key=cat_totals.get)

                # Generate a short AI tip
                prompt = (
                    f"The user spent ${total:.2f} last week across {len(expenses)} transactions. "
                    f"Top category: {top_cat} (${cat_totals[top_cat]:.2f}). "
                    "Give ONE specific, practical, friendly money tip in 2 sentences max."
                )
                tip_response = client.messages.create(
                    model='claude-opus-4-5',
                    max_tokens=100,
                    messages=[{'role': 'user', 'content': prompt}]
                )
                tip = tip_response.content[0].text.strip()

                # Build and send HTML email
                week_label = week_start.strftime("%b %d") + " – " + now.strftime("%b %d, %Y")
                html_body = f"""
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#f8f9fc;padding:0;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#1a1060,#2d1b8e);padding:32px 36px">
    <h1 style="color:#fff;margin:0;font-size:1.4rem">💰 FinanceAI Weekly Digest</h1>
    <p style="color:rgba(255,255,255,0.6);margin:6px 0 0;font-size:0.85rem">{week_label}</p>
  </div>
  <div style="padding:28px 36px">
    <p style="color:#334155;margin:0 0 20px">Hi <strong>{sub["username"]}</strong> 👋</p>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px">
      <div style="background:#fff;border-radius:12px;padding:16px;text-align:center;border:1px solid #e8eaf2">
        <div style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Total Spent</div>
        <div style="font-size:1.4rem;font-weight:800;color:#6366f1">${round(total,2):.2f}</div>
      </div>
      <div style="background:#fff;border-radius:12px;padding:16px;text-align:center;border:1px solid #e8eaf2">
        <div style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Transactions</div>
        <div style="font-size:1.4rem;font-weight:800;color:#6366f1">{len(expenses)}</div>
      </div>
      <div style="background:#fff;border-radius:12px;padding:16px;text-align:center;border:1px solid #e8eaf2">
        <div style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Top Category</div>
        <div style="font-size:1rem;font-weight:800;color:#6366f1">{top_cat}</div>
      </div>
    </div>

    <div style="background:#fff;border-radius:12px;padding:20px;border:1px solid #e8eaf2;margin-bottom:20px">
      <div style="font-size:0.75rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Spending Breakdown</div>
      {"".join(f'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:0.875rem;color:#334155">{c}</span><span style="font-size:0.875rem;font-weight:700;color:#6366f1">${a:.2f}</span></div>' for c,a in sorted(cat_totals.items(), key=lambda x:x[1], reverse=True))}
    </div>

    <div style="background:#eef2ff;border-radius:12px;padding:20px;border:1px solid #c7d2fe;margin-bottom:24px">
      <div style="font-size:0.75rem;color:#6366f1;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;font-weight:700">✨ AI Tip of the Week</div>
      <p style="color:#334155;margin:0;font-size:0.9rem;line-height:1.6">{tip}</p>
    </div>

    <a href="http://localhost:3000/dashboard" style="display:block;text-align:center;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:14px;border-radius:12px;text-decoration:none;font-weight:700;font-size:0.9rem">
      Open FinanceAI →
    </a>
  </div>
  <div style="padding:16px 36px;text-align:center;color:#94a3b8;font-size:0.75rem;border-top:1px solid #e8eaf2">
    FinanceAI · You're receiving this because you subscribed to weekly digests.
  </div>
</div>"""

                msg = Message(
                    subject=f"💰 Your FinanceAI Weekly Digest – {week_label}",
                    recipients=[sub['email']],
                    html=html_body
                )
                mail.send(msg)
                print(f"✅ Digest sent to {sub['email']}")
                sent.append(sub['email'])

            except Exception as user_err:
                print(f"Digest error for user {user_id_str}: {str(user_err)}")
                continue

        return jsonify({'msg': f'Digest processed for {len(sent)} users', 'sent_to': sent}), 200

    except Exception as e:
        print(f"Send digest error: {str(e)}")
        return jsonify({'msg': f'Digest error: {str(e)}'}), 500