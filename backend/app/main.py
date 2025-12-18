from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from backend/.env before importing routes
BASE_DIR = Path(__file__).resolve().parent.parent  # backend/app -> backend
load_dotenv(BASE_DIR / ".env")

from app.api.routes import exam, conversation, scoring

app = FastAPI(title="TEF Canada Oral Exam Simulator", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
    ],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for images
static_path = Path(__file__).parent.parent.parent
section_a_dir = static_path / "section_a_images"
section_b_dir = static_path / "section_b_images"

if section_a_dir.exists():
    app.mount(
        "/section_a_images",
        StaticFiles(directory=str(section_a_dir)),
        name="section_a_images",
    )
if section_b_dir.exists():
    app.mount(
        "/section_b_images",
        StaticFiles(directory=str(section_b_dir)),
        name="section_b_images",
    )

# Include routers
app.include_router(exam.router, prefix="/api/exam", tags=["exam"])
app.include_router(
    conversation.router, prefix="/api/conversation", tags=["conversation"]
)
app.include_router(scoring.router, prefix="/api/scoring", tags=["scoring"])


@app.get("/")
def root():
    return {"message": "TEF Canada Oral Exam Simulator API"}


@app.get("/health")
def health():
    return {"status": "healthy"}
