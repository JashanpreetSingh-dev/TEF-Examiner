import json
import uuid
import random
from pathlib import Path
from typing import Optional, List, Dict
from datetime import datetime

from app.models.exam_session import ExamSession, ExamState
from app.utils.state_machine import ExamStateMachine


class ExamService:
    def __init__(self):
        """
        Initialise the exam service and load the knowledge bases.

        Directory layout (from this file):
        - this file: backend/app/services/exam_service.py
        - project root: ../../.. (three levels up)
        - JSON files live in the project root:
          - section_a_knowledge_base.json
          - section_b_knowledge_base.json
        """
        # Resolve project root (TEF Simulator) regardless of CWD
        self.base_path = Path(__file__).resolve().parents[3]

        # Primary locations: project root JSON files (current layout)
        self.section_a_path = self.base_path / "section_a_knowledge_base.json"
        self.section_b_path = self.base_path / "section_b_knowledge_base.json"

        # Optional fallback: backend/data/ if you later move the JSONs there
        if not self.section_a_path.exists() or not self.section_b_path.exists():
            data_path = self.base_path / "backend" / "data"
            alt_a = data_path / "section_a_knowledge_base.json"
            alt_b = data_path / "section_b_knowledge_base.json"
            if alt_a.exists() and alt_b.exists():
                self.section_a_path = alt_a
                self.section_b_path = alt_b

        self.sessions: Dict[str, ExamSession] = {}
        self._load_knowledge_bases()

    def _load_knowledge_bases(self):
        """Load knowledge base JSON files"""
        with open(self.section_a_path, "r", encoding="utf-8") as f:
            self.section_a_data = json.load(f)

        with open(self.section_b_path, "r", encoding="utf-8") as f:
            self.section_b_data = json.load(f)

    def get_topics(self, section: str) -> List[Dict]:
        """Get all topics for a section"""
        if section == "EO1":
            return self.section_a_data
        elif section == "EO2":
            return self.section_b_data
        return []

    def get_topic(self, section: str, topic_id: int) -> Optional[Dict]:
        """Get a specific topic by ID"""
        topics = self.get_topics(section)
        for topic in topics:
            if topic.get("id") == topic_id:
                # Update image path to use correct folder
                if section == "EO1":
                    topic["image"] = f"/section_a_images/section_a_image_{topic_id}.png"
                elif section == "EO2":
                    topic["image"] = f"/section_b_images/section_b_image_{topic_id}.png"
                return topic
        return None

    def create_session(self, section: str, topic_id: Optional[int] = None) -> Dict:
        """Create a new exam session"""
        # Select random topic if not specified
        if topic_id is None:
            topics = self.get_topics(section)
            topic = random.choice(topics)
            topic_id = topic["id"]
        else:
            topic = self.get_topic(section, topic_id)
            if not topic:
                raise ValueError(f"Topic {topic_id} not found for section {section}")

        session_id = str(uuid.uuid4())

        session = ExamSession(
            session_id=session_id,
            section=section,
            topic_id=topic_id,
            state=ExamState.IDLE,
            created_at=datetime.now(),
            state_machine=ExamStateMachine(),
        )

        self.sessions[session_id] = session

        return {
            "session_id": session_id,
            "section": section,
            "topic": topic,
            "state": session.state.value,
        }

    def get_session(self, session_id: str) -> Optional[ExamSession]:
        """Get session by ID"""
        return self.sessions.get(session_id)

    def end_session(self, session_id: str) -> Optional[ExamSession]:
        """End a session"""
        session = self.sessions.get(session_id)
        if session:
            session.state = ExamState.COMPLETED
        return session
