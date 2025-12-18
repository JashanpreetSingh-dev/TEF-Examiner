from enum import Enum
from typing import Dict, Set


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


class ExamStateMachine:
    """State machine for exam flow"""

    def __init__(self):
        self.current_state = ExamState.IDLE
        self._transitions: Dict[ExamState, Set[ExamState]] = {
            ExamState.IDLE: {ExamState.SELECTION},
            ExamState.SELECTION: {ExamState.INSTRUCTIONS},
            ExamState.INSTRUCTIONS: {ExamState.AD_DISPLAY},
            ExamState.AD_DISPLAY: {ExamState.EXAM_ACTIVE},
            ExamState.EXAM_ACTIVE: {ExamState.TIME_EXPIRED},
            ExamState.TIME_EXPIRED: {ExamState.GRADING},
            ExamState.GRADING: {ExamState.RESULTS},
            ExamState.RESULTS: {ExamState.COMPLETED},
        }

    def can_transition(self, target_state: ExamState) -> bool:
        """Check if transition to target state is allowed"""
        allowed = self._transitions.get(self.current_state, set())
        return target_state in allowed

    def transition(self, target_state: ExamState) -> bool:
        """Attempt to transition to target state"""
        if self.can_transition(target_state):
            self.current_state = target_state
            return True
        return False

    def get_state(self) -> ExamState:
        """Get current state"""
        return self.current_state
