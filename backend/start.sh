#!/bin/bash
# Start script for backend server

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Load environment variables
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Start the server
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0

