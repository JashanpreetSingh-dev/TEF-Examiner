@echo off
REM Start script for backend server (Windows)

REM Activate virtual environment if it exists
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
)

REM Start the server
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0

