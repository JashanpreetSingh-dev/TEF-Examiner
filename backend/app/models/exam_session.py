from enum import Enum
from datetime import datetime
from typing import Optional, Dict, List
from pydantic import BaseModel

from app.utils.state_machine import ExamStateMachine


class ExamState(Enum):
    IDLE = "idle"
    SELECTION = "selection"
    INSTRUCTIONS = "instructions"
    AD_DISPLAY = "ad_display"
    EXAM_ACTIVE = "exam_active"
    TIME_EXPIRED = "time_expired"
    GRADING = "grading"
    RESULTS = "results"
    COMPLETED = "completed"


class ExamSession(BaseModel):
    session_id: str
    section: str  # EO1 or EO2
    topic_id: int
    state: ExamState
    created_at: datetime
    state_machine: ExamStateMachine
    transcript: Optional[List[Dict]] = None
    scores: Optional[Dict] = None
    clb_result: Optional[Dict] = None

    class Config:
        arbitrary_types_allowed = True
