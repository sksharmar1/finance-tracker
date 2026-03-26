# Development Checklist - AI Finance Tracker

Last Updated: March 2026

## Project Structure

finance-tracker/
├── backend/          ← Flask + ML
├── frontend/         ← React
├── .gitignore
├── README.md
├── RUNNING_THE_APP.md
└── DEVELOPMENT_CHECKLIST.md


---

## 1. How to Start the App (Daily Workflow)

### Backend
```bash
cd backend
source .venv/bin/activate
python app.py

cd frontend
npm start

2. Quick Checklist Before Working

 Backend venv activated? (source .venv/bin/activate)
 PostgreSQL running? (brew services start postgresql@18)
 Backend running on http://127.0.0.1:5000?
 Frontend running on http://localhost:3000?
 Can I successfully login in the browser?


3. Common Development Tasks
Backend Changes

 Add new route or endpoint
 Update ML model (training data)
 Add new dependency → pip install ... then pip freeze > requirements.txt
 Test endpoint with Postman
 Restart Flask after changes

Frontend Changes

 Modify React component
 Add new npm package → npm install ...
 Test in browser
 Hard refresh (Cmd + Shift + R) after major changes

ML Improvements

 Add more training examples in app.py
 Test /predict-category endpoint
 Improve accuracy of suggestions


4. Testing Checklist

 Register new user
 Login successfully
 Add expense
 Delete expense
 AI suggestion appears while typing description
 Progress bars / recent spending cards update correctly
 Total Spent updates correctly
 Logout works


5. Deployment Checklist (Railway)

 Code pushed to GitHub
 Backend deployed with PostgreSQL
 Frontend deployed
REACT_APP_API_URL set to backend URL
 Test full flow on live URLs
 Update README with live links


6. Git Workflow
Bashgit add .
git commit -m "Clear message of what changed"
git push origin main
Good commit examples:

"Add ML predict-category endpoint"
"Enhance dashboard with animated progress bars"
"Fix login issue after backend restructure"

7. Troubleshooting Quick Reference

































ProblemSolutionModuleNotFoundErrorActivate venv + pip install -r requirements.txtreact-scripts: command not foundcd frontend → npm installBackend connection refusedMake sure python app.py is runningFrontend not seeing backendCheck REACT_APP_API_URL or use http://127.0.0.1:5000 locallyCharts not showingHard refresh (Cmd + Shift + R)ML suggestion not workingTest /predict-category in Postman first

Tip: Keep both RUNNING_THE_APP.md and DEVELOPMENT_CHECKLIST.md open while developing.
Would you like me to also create a "NEXT_FEATURES.md" with prioritized ideas (improved ML, charts with Chart.js, dark mode, etc.)?
Or shall we continue improving the current ML suggestion / dashboard?
Just say what you'd like to do next!
text---

**How to save it:**

1. In your project root (`finance-tracker/`), create the file:

   ```bash
   touch DEVELOPMENT_CHECKLIST.md

Open it in PyCharm or any editor and paste the content above.