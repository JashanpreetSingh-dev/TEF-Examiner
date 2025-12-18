import axios from 'axios';
import { ExamSection, Topic, ExamSession, TranscriptEntry, ExamResults } from '../types/exam';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const examAPI = {
  async getTopics(section: ExamSection): Promise<Topic[]> {
    const response = await api.get(`/api/exam/topics?section=${section}`);
    return response.data.topics;
  },

  async getTopic(section: ExamSection, topicId: number): Promise<Topic> {
    const response = await api.get(`/api/exam/topic/${topicId}?section=${section}`);
    return response.data;
  },

  async startSession(section: ExamSection, topicId?: number): Promise<ExamSession> {
    const response = await api.post('/api/exam/session/start', {
      section,
      topic_id: topicId,
    });
    return response.data;
  },

  async getSession(sessionId: string): Promise<ExamSession> {
    const response = await api.get(`/api/exam/session/${sessionId}`);
    return response.data;
  },

  async endSession(sessionId: string): Promise<void> {
    await api.post(`/api/exam/session/${sessionId}/end`);
  },

  async evaluateExam(
    sessionId: string,
    transcript: TranscriptEntry[],
    section: ExamSection,
    topicId: number,
    speakingTimeSec: number,
    totalTimeSec: number
  ): Promise<ExamResults> {
    const response = await api.post('/api/scoring/evaluate', {
      session_id: sessionId,
      transcript,
      section,
      topic_id: topicId,
      speaking_time_sec: speakingTimeSec,
      total_time_sec: totalTimeSec,
    });
    return response.data;
  },
};

export default api;

