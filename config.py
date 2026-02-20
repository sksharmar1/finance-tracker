import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # OpenAI API Key
    SECRET_KEY = os.getenv('SECRET_KEY') or 'kaqkof-ryzHib-5rizwo-9n2s8l-5v6m1e'
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL') or 'postgresql://postgres:n8e2h7a6@localhost:5441/finance_db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY') or 'kaqkof-ryzHib-5rizwo-9n2s8l-5v6m1e'