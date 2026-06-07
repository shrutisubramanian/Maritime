from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import documents
from app.database import Base, engine
from app.models import *

from app.routers import auth, jobs, profiles, quotes, requests

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Horizon Maritime API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(profiles.router)
app.include_router(quotes.router)
app.include_router(requests.router)
app.include_router(documents.router)

@app.get("/")
def root():
    return {"message": "Welcome to the Horizon Maritime API!"}