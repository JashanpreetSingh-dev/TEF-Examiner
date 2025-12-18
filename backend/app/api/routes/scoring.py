from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict

from app.services.scoring_service import ScoringService
from app.services.clb_mapper import CLBMapper

router = APIRouter()
scoring_service = ScoringService()
clb_mapper = CLBMapper()


class ScoringRequest(BaseModel):
    session_id: str
    transcript: List[Dict]  # List of utterances with speaker, text, timestamp
    section: str  # EO1 or EO2
    topic_id: int
    speaking_time_sec: float
    total_time_sec: float


@router.post("/evaluate")
async def evaluate_exam(request: ScoringRequest):
    """Evaluate an exam attempt and return scores"""
    if request.section not in ["EO1", "EO2"]:
        raise HTTPException(status_code=400, detail="Section must be EO1 or EO2")

    # Layer 1: Deterministic scoring
    deterministic_scores = scoring_service.calculate_deterministic_scores(
        transcript=request.transcript,
        section=request.section,
        speaking_time_sec=request.speaking_time_sec,
        total_time_sec=request.total_time_sec,
    )

    # Layer 2: AI qualitative evaluation
    ai_scores = await scoring_service.evaluate_qualitative(
        transcript=request.transcript,
        section=request.section,
        topic_id=request.topic_id,
    )

    # Layer 3: CLB mapping
    clb_result = clb_mapper.map_to_clb(
        deterministic_scores=deterministic_scores,
        ai_scores=ai_scores,
        section=request.section,
    )

    return {
        "session_id": request.session_id,
        "deterministic_scores": deterministic_scores,
        "ai_scores": ai_scores,
        "clb_level": clb_result["clb_level"],
        "readiness": clb_result["readiness"],
        "improvement_points": clb_result["improvement_points"],
        "examiner_explanation": clb_result["examiner_explanation"],
    }
