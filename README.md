# 💰 FinanceAI

> An AI-powered personal finance tracker built with React, Flask, PostgreSQL, and the Anthropic Claude API.

![FinanceAI Dashboard](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react) ![Flask](https://img.shields.io/badge/Flask-3.x-000000?style=flat&logo=flask) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql) ![Claude](https://img.shields.io/badge/Claude-Anthropic-D97706?style=flat)

---

## 🌟 Features

### Core
- **Expense Tracking** — Add, categorise, and delete expenses with full CRUD
- **ML Category Prediction** — Hybrid scikit-learn Naive Bayes + keyword model auto-categorises expenses with a confidence ring
- **Thumbs Up/Down Feedback** — Correct AI predictions to retrain the model over time
- **Dark / Light Mode** — Persistent theme toggle

### AI-Powered
- **✨ Quick Add** — Type expenses in plain English ("coffee $4.50") and Claude parses them instantly
- **📷 Receipt Scan** — Upload a photo of any receipt and Claude Vision extracts the total and category
- **📄 AI Monthly Report** — Claude generates a personalised financial narrative with insights and recommendations
- **💬 Finance Chatbot** — Ask Claude anything about budgeting, spending, or saving

### Dashboard & Analytics
- **Overview Tab** — Total spend, month-over-month comparison, category breakdown with progress bars, recent transactions
- **Monthly Tab** — Bar chart showing spending by month with trend indicators
- **All Expenses Tab** — Full sortable table with 🔁 recurring expense detection and CSV export
- **Budgets Tab** — Per-category monthly budget caps with amber/red warnings at 80%/100%
- **Goals Tab** — Savings goals with circular progress rings, deadlines, and emoji picker

### Household Mode
- Create a household and generate an 8-character invite code
- Invite family members or housemates to join
- View combined household expenses tagged by who added them
- Spending split view showing fair share and who owes what

### Export
- **📊 Tax Report** — Annual expense report with AI executive summary, monthly breakdown, category totals, and full itemised ledger — downloadable as **PDF** or **HTML**
- **↓ CSV Export** — Export all expenses for use in spreadsheets

---

## 🗂 Project Structure

```
finance-tracker/
├── frontend/                   # React + TypeScript app
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx   # Main app UI (~2100 lines)
│   │   │   ├── Login.tsx       # Auth page
│   │   │   └── Register.tsx    # Registration page
│   │   ├── utils/
│   │   │   └── api.ts          # Axios instance with JWT interceptor
│   │   ├── App.tsx             # Router + PrivateRoute
│   │   └── index.tsx           # React entry point
│   ├── package.json
│   └── tailwind.config.js
│
├── backend/                    # Flask + Python API
│   ├── finance_app.py          # All routes and models
│   ├── seed.py                 # Database seeder with test data
│   ├── category_model.pkl      # Trained ML model (auto-generated)
│   └── .env                    # Environment variables (not committed)
│
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+
- **PostgreSQL** 14+
- **Anthropic API key** — get one at [console.anthropic.com](https://console.anthropic.com)

---

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/finance-tracker.git
cd finance-tracker
```

---

### 2. Set up the database

```bash
# Create the database
psql postgres
CREATE DATABASE finance_db;
\q
```

---

### 3. Set up the backend

```bash
cd backend

# Create and activate a virtual environment
python3 -m venv ../.venv
source ../.venv/bin/activate      # Mac/Linux
# .venv\Scripts\activate          # Windows

# Install dependencies
pip install flask flask-jwt-extended flask-cors flask-sqlalchemy \
            werkzeug python-dotenv scikit-learn anthropic \
            psycopg2-binary reportlab
```

#### Create your `.env` file

```bash
# backend/.env
SECRET_KEY=your-secret-key-change-me
JWT_SECRET_KEY=your-jwt-secret-change-me
DATABASE_URL=postgresql:///finance_db
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

#### Initialise the database

```bash
python - << 'EOF'
from finance_app import app, db
with app.app_context():
    db.create_all()
    print("✅ Tables created")
EOF
```

#### (Optional) Seed test data

```bash
python seed.py
```

This creates the following test accounts (all passwords: `Test1234!`):

| Username | Household | Role |
|---|---|---|
| `sksharma` | Sharma Family | Owner |
| `priyasharma` | Sharma Family | Member |
| `rahulsharma` | Sharma Family | Member |
| `alicejohnson` | The Johnsons | Owner |
| `bobjohnson` | The Johnsons | Member |
| `testaccount1` | None | — |

#### Start the backend

```bash
python finance_app.py
# Running on http://127.0.0.1:5000
```

---

### 4. Set up the frontend

```bash
cd ../frontend

# Install dependencies
npm install

# Start the dev server
npm start
# Running on http://localhost:3000
```

---

### 5. Open the app

Navigate to **[http://localhost:3000](http://localhost:3000)** and log in with any of the seeded accounts, or register a new one.

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/register` | Register a new user |
| POST | `/login` | Login and receive JWT |

### Expenses
| Method | Endpoint | Description |
|---|---|---|
| GET | `/expenses` | Get all expenses for current user |
| POST | `/expenses` | Add a new expense |
| DELETE | `/expenses/<id>` | Delete an expense |

### AI Features
| Method | Endpoint | Description |
|---|---|---|
| POST | `/predict-category` | ML + keyword category prediction |
| POST | `/feedback` | Submit thumbs up/down correction |
| POST | `/chat` | Finance chatbot |
| POST | `/parse-expense` | Natural language expense parsing |
| POST | `/scan-receipt` | Receipt image scanning via Claude Vision |
| POST | `/generate-report` | AI monthly financial report |
| POST | `/export-tax` | Annual tax report (PDF or HTML) |

### Household
| Method | Endpoint | Description |
|---|---|---|
| GET | `/household` | Get current user's household |
| POST | `/household/create` | Create a new household |
| POST | `/household/join` | Join a household by invite code |
| POST | `/household/leave` | Leave current household |
| GET | `/household/expenses` | All household member expenses |
| GET | `/household/summary` | Spending split and balances |

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS |
| Fonts | Plus Jakarta Sans, Outfit |
| HTTP Client | Axios with JWT interceptor |
| Backend | Flask 3, Flask-JWT-Extended, Flask-CORS |
| Database | PostgreSQL, SQLAlchemy ORM |
| ML | scikit-learn (Naive Bayes + CountVectorizer) |
| AI | Anthropic Claude (claude-opus-4-5) |
| PDF | ReportLab |
| Auth | JWT (7-day expiry) |

---

## 📦 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | ✅ | Flask session secret |
| `JWT_SECRET_KEY` | ✅ | JWT signing key |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key for Claude |

---

## 📸 Screenshots

> Dashboard overview, receipt scanning, household mode, and tax export are all accessible from the main navigation.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

- [GROK(https://grok.com) started the whole project workflow
- [Anthropic](https://anthropic.com) for the Claude API
- [Flask](https://flask.palletsprojects.com) for the backend framework
- [Create React App](https://create-react-app.dev) for the frontend scaffold
- [ReportLab](https://www.reportlab.com) for PDF generation
