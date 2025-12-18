import { ExamState } from '../types/exam';

export class ExamStateMachine {
  private currentState: ExamState = 'idle';
  
  private transitions: Record<ExamState, ExamState[]> = {
    idle: ['selection'],
    selection: ['instructions'],
    instructions: ['ad_display'],
    ad_display: ['exam_active'],
    exam_active: ['time_expired'],
    time_expired: ['grading'],
    grading: ['results'],
    results: ['completed'],
    completed: [],
  };

  getState(): ExamState {
    return this.currentState;
  }

  canTransition(targetState: ExamState): boolean {
    const allowed = this.transitions[this.currentState] || [];
    return allowed.includes(targetState);
  }

  transition(targetState: ExamState): boolean {
    if (this.canTransition(targetState)) {
      this.currentState = targetState;
      return true;
    }
    return false;
  }

  reset(): void {
    this.currentState = 'idle';
  }
}

