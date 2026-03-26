# Finance Tracker

A full-stack personal finance management application built with Flask (Python) backend and React (TypeScript) frontend.

## Project Structure

```
finance-tracker/
├── backend/                 # Flask API server
│   ├── app.py              # Main Flask application
│   ├── config.py           # Configuration settings
│   ├── models.py           # Database models
│   ├── routes.py           # API endpoints
│   ├── main.py             # Entry point
│   ├── add_test_data.py    # Test data script
│   ├── .env                # Environment variables
│   ├── requirements.txt    # Python dependencies
│   └── .venv/              # Virtual environment
│
├── frontend/               # React TypeScript application
│   ├── src/                # Source code
│   │   ├── pages/          # Page components
│   │   ├── utils/          # Utility functions
│   │   └── App.tsx         # Main app component
│   ├── public/             # Static assets
│   ├── package.json        # Node dependencies
│   └── tsconfig.json       # TypeScript config
│
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

## Quick Start

### Backend Setup
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

## Features
- User authentication with JWT
- Expense tracking and management
- Category management with ML suggestions
- Dashboard with expense analytics
- Responsive UI with Tailwind CSS

## Documentation
- See `backend/RUNNING_THE_APP.md` for backend setup details
- See `backend/DEVELOPMENT_CHECKLIST.md` for development guidelines
- See `backend/NEXT_FEATURES.md` for planned features

