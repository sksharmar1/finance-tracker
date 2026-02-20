AI-Powered Personal Finance Tracker
Full-stack web application for managing personal expenses with planned AI/ML enhancements.
Current Stage (Backend – Week 1 completed):

User authentication (registration & login with JWT)
Secure expense CRUD operations (add, list)
PostgreSQL database with SQLAlchemy ORM
Protected API endpoints
Environment configuration via .env

Tech Stack (so far):

Backend: Flask, SQLAlchemy, Flask-JWT-Extended
Database: PostgreSQL
Other: python-dotenv, werkzeug (password hashing), flask-cors

Roadmap:

React frontend with responsive dashboard
ML model for automatic expense categorization
Budget trend analysis & predictions
Charts/visualizations
Deployment (Vercel/Railway)

Built as part of my full-stack + AI/ML self-learning journey.

# AI-Powered Personal Finance Tracker

Full-stack web application for tracking personal expenses with upcoming AI/ML features for automatic categorization and budget predictions.

![Dashboard Preview](https://via.placeholder.com/800x400?text=Coming+Soon:+Dashboard+Screenshot)  
*(Add real screenshot later via Loom recording or local image)*

## Tech Stack (Week 1 – Backend)

- **Backend**: Python + Flask
- **Database**: PostgreSQL (with SQLAlchemy ORM)
- **Authentication**: JWT (flask-jwt-extended)
- **Security**: Password hashing (werkzeug), CORS
- **Environment**: python-dotenv
- **Deployment prep**: Ready for Heroku / Railway / Docker

## Features Implemented (Week 1)

- User registration (`POST /register`)
- User login with JWT token (`POST /login`)
- Add expense (`POST /expenses`) – protected
- List expenses (`GET /expenses`) – protected
- Automatic table creation on startup
- Basic input validation & error handling

## Setup Instructions

### Prerequisites
- Python 3.9+
- PostgreSQL 18 (via Homebrew: `brew install postgresql@18`)
- Git

### Local Development

1. Clone the repo
   ```bash
   git clone https://github.com/yourusername/ai-finance-tracker.git
   cd ai-finance-tracker
2. Create virtual environment
   python -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\activate
3. Install dependencies
   pip install -r requirements.txt
4. Set up PostgreSQL
   brew services start postgresql@18
   createdb finance_db
5. Create .env file
   brew services start postgresql@18
   createdb finance_db
6. Run the app
   DATABASE_URL=postgresql:///finance_db
   SECRET_KEY=your-very-long-random-secret
   JWT_SECRET_KEY=another-very-long-random-secret


API Endpoints (Week 1)

Method Endpoint    Description          Auth?
POST   /register   Create new user       No
POST   /login      Login & get JWT       No
GET    /expenses   List user's expenses  Yes
POST   /expenses   Add new expense       Yes

MethodEndpointDescriptionAuth?POST/registerCreate new userNoPOST/loginLogin & get JWTNoGET/expensesList user's expensesYesPOST/expensesAdd new expenseYes
(Protected endpoints require Authorization: Bearer <token> header)

Upcoming Features (Weeks 2+)

- React frontend (login, dashboard, forms)
- ML-based expense categorization (scikit-learn / Hugging Face)
- Budget forecasting & visualizations
- Deployment (Vercel + Railway)

Testing
Use Postman collection (export coming soon) or curl examples in docs.
