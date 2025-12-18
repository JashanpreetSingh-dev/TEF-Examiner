from fastapi import APIRouter, HTTPException
from typing import Optional
from pydantic import BaseModel

from app.services.exam_service import ExamService

router = APIRouter()
exam_service = ExamService()


class StartSessionRequest(BaseModel):
    section: str
    topic_id: Optional[int] = None


@router.get("/topics")
async def get_topics(section: str):
    """Get available topics for a section (EO1 or EO2)"""
    if section not in ["EO1", "EO2"]:
        raise HTTPException(status_code=400, detail="Section must be EO1 or EO2")

    topics = exam_service.get_topics(section)
    return {"topics": topics}


@router.get("/topic/{topic_id}")
async def get_topic(section: str, topic_id: int):
    """Get a specific topic by ID"""
    topic = exam_service.get_topic(section, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    return topic


@router.post("/session/start")
async def start_session(request: StartSessionRequest):
    """Start a new exam session"""
    if request.section not in ["EO1", "EO2"]:
        raise HTTPException(status_code=400, detail="Section must be EO1 or EO2")

    session = exam_service.create_session(request.section, request.topic_id)
    return session


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    """Get session details"""
    session = exam_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/session/{session_id}/end")
async def end_session(session_id: str):
    """End an exam session (mark as completed)"""
    session = exam_service.end_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session
