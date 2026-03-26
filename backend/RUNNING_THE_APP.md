How to Run the AI-Powered Personal Finance Tracker
Project Structure

finance-tracker/
├── backend/              ← Flask + ML backend
│   ├── app.py
│   ├── .env
│   ├── requirements.txt
│   └── ...
├── frontend/             ← React frontend
│   ├── src/
│   ├── package.json
│   └── ...
└── README.md

1. Backend (Flask + PostgreSQL + ML)
Location: backend/ folder
Step-by-step to start backend:

Bash
# 1. Go to backend folder
cd backend

# 2. Activate virtual environment
source .venv/bin/activate     # On macOS/Linux
# .venv\Scripts\activate      # On Windows

# 3. Install dependencies (only once or when requirements change)
pip install -r requirements.txt

# 4. Make sure PostgreSQL is running
brew services start postgresql@18     # or postgresql

# 5. Start the Flask app
python app.py

Expected output:
You should see:
✅ ML Category Model trained successfully!
* Running on http://127.0.0.1:5000


Backend URLs to test:

http://127.0.0.1:5000/register
http://127.0.0.1:5000/login
http://127.0.0.1:5000/predict-category


2. Frontend (React)
Location: frontend/ folder
Step-by-step to start frontend:

Bash

# 1. Go to frontend folder (in a new terminal tab)
cd frontend

# 2. Install dependencies (only once or when you add packages)
npm install

# 3. Start React development server
npm start
Expected: Browser opens at http://localhost:3000

Full Development Workflow (Recommended)
Open two terminal tabs:
Terminal 1 – Backend
Bash cd backend
source .venv/bin/activate
python app.py

Terminal 2 – Frontend
Bash cd frontend
npm start

Common Commands Summary
Action                                                      Command
Activate venv                                          source .venv/bin/activate
Run backend                                           python app.py
Run frontend                                           npm start
Install new Python package                   pip install package-name → then pip freeze > requirements.txt
Install new npm package                        npm install package-name
Hard refresh React                                 Cmd + Shift + R in browser
Stop servers                                            Ctrl + C in each terminal

Important Notes

Always activate the virtual environment before running python app.py
Never commit .env or backend/.venv/ to Git
When you add new dependencies:
Backend → pip freeze > requirements.txt
Frontend → npm install ...

If PostgreSQL connection fails, check your .env file has correct DATABASE_URL