# TEF Canada – Expression Orale Simulator

A web-based simulator for the TEF Canada – Expression Orale exam that reproduces real exam conditions.

## Features

- **Section A (EO1)** – Asking questions (5 minutes, formal register)
- **Section B (EO2)** – Convincing a friend (10 minutes, informal register)
- Strict time limits with forced cutoff
- Live AI conversation using OpenAI Realtime API
- Multi-layer scoring system (deterministic + AI-assisted)
- CLB level estimation (4-12)
- Examiner-style evaluation

## Prerequisites

- Python 3.11, 3.12, or 3.13
- Node.js 18+
- OpenAI API key

**Note for Python 3.13 users:** Some packages require Rust to compile. If you encounter Rust errors:
1. Install Rust from https://rustup.rs/ (recommended - one-time setup)
2. Restart your terminal
3. Retry `pip install -r requirements.txt`

See `backend/INSTALL_RUST.md` for detailed instructions.

## Setup

### Backend

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file:
```bash
cp .env.example .env
```

5. Add your OpenAI API key to `.env`:
```
OPENAI_API_KEY=your_key_here
```

6. Run the backend server:
```bash
uvicorn app.main:app --reload --port 8000
```

### Frontend

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

**Note:** The frontend uses Next.js 14 with shadcn/ui components and Tailwind CSS.

## Project Structure

```
tef-simulator/
├── backend/
│   ├── app/
│   │   ├── api/routes/     # API endpoints
│   │   ├── services/       # Business logic
│   │   ├── models/         # Data models
│   │   └── utils/          # Utilities
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── services/      # API clients
│   │   ├── state/         # State management
│   │   └── types/         # TypeScript types
│   └── package.json
├── section_a_images/       # EO1 advertisement images
├── section_b_images/       # EO2 advertisement images
├── section_a_knowledge_base.json
└── section_b_knowledge_base.json
```

## Usage

1. Start both backend and frontend servers
2. Open `http://localhost:3000` in your browser
3. Select a section (EO1 or EO2)
4. Read the instructions
5. View the advertisement
6. Begin the exam (microphone will auto-start)
7. Complete the exam within the time limit
8. View your results and CLB level

## Exam Flow

1. **Section Selection** - Choose EO1 or EO2
2. **Instructions** - Read exam instructions
3. **Advertisement Display** - View the ad (15 seconds)
4. **Live Exam** - Real-time conversation with AI
5. **Time Expiration** - Automatic cutoff when time runs out
6. **Grading** - Multi-layer evaluation
7. **Results** - View CLB level and feedback

## Technical Details

- **Backend**: FastAPI with WebSocket support
- **Frontend**: React with TypeScript
- **AI**: OpenAI GPT-4 + Realtime API
- **Audio**: Browser MediaRecorder API + OpenAI Realtime API streaming
- **State Management**: Custom state machine

## Notes

- The exam experience is designed to be stressful and realistic
- No pause, restart, or hints during the exam
- One attempt per session (immutable)
- Timer cannot be paused or manipulated
- AI conversation ends immediately when time expires

## License

This project is for educational purposes.

