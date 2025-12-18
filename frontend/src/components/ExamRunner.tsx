'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Topic, TranscriptEntry } from '@/types/exam';
import { Timer } from './Timer';
import { AudioRecorder } from './AudioRecorder';
import { RealtimeAPI } from '@/services/realtimeApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ExamRunnerProps {
  sessionId: string;
  topic: Topic;
  onTimeExpired: () => void;
  onTranscriptUpdate: (transcript: TranscriptEntry[]) => void;
}

export const ExamRunner: React.FC<ExamRunnerProps> = ({
  sessionId,
  topic,
  onTimeExpired,
  onTranscriptUpdate,
}) => {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isTimeExpired, setIsTimeExpired] = useState(false);
  const [speakingTime, setSpeakingTime] = useState(0);
  const [startTime] = useState(Date.now());
  const realtimeApiRef = useRef<RealtimeAPI | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);

  useEffect(() => {
    // Initialize Realtime API connection
    const realtimeApi = new RealtimeAPI();
    realtimeApiRef.current = realtimeApi;

    realtimeApi.connect({
      sessionId,
      section: topic.section,
      onTranscript: (text, speaker) => {
        const newEntry: TranscriptEntry = {
          speaker,
          text,
          timestamp: Date.now() - startTime,
        };
        transcriptRef.current = [...transcriptRef.current, newEntry];
        setTranscript([...transcriptRef.current]);
        onTranscriptUpdate([...transcriptRef.current]);

        // Track speaking time for user
        if (speaker === 'user') {
          // Estimate speaking time (rough calculation)
          const wordCount = text.split(' ').length;
          const estimatedTime = wordCount * 0.5; // ~0.5 seconds per word
          setSpeakingTime((prev) => prev + estimatedTime);
        }
      },
      onError: (error) => {
        console.error('Realtime API error:', error);
      },
      onTimeExpired: () => {
        setIsTimeExpired(true);
        onTimeExpired();
      },
    });

    return () => {
      realtimeApi.disconnect();
    };
  }, [sessionId, topic.section, startTime, onTimeExpired, onTranscriptUpdate]);

  const handleAudioChunk = async (audioData: ArrayBuffer) => {
    if (realtimeApiRef.current && !isTimeExpired) {
      await realtimeApiRef.current.sendAudioChunk(audioData);
    }
  };

  const handleTimeExpire = () => {
    setIsTimeExpired(true);
    if (realtimeApiRef.current) {
      realtimeApiRef.current.notifyTimeExpired();
    }
    onTimeExpired();
  };

  const imagePath = topic.image || 
    (topic.section === 'EO1' 
      ? `/section_a_images/section_a_image_${topic.id}.png`
      : `/section_b_images/section_b_image_${topic.id}.png`);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Timer
        initialSeconds={topic.time_limit_sec}
        onExpire={handleTimeExpire}
        isActive={!isTimeExpired}
      />
      
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 mt-24 mb-24">
        <Card>
          <CardHeader>
            <CardTitle>Publicité</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-[calc(100vh-300px)] overflow-hidden">
            <img
              src={imagePath}
              alt="Advertisement"
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Conversation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[calc(100vh-300px)] overflow-y-auto space-y-3">
              {transcript.length === 0 ? (
                <p className="text-muted-foreground italic text-center py-8">
                  La conversation commencera bientôt...
                </p>
              ) : (
                transcript.map((entry, index) => (
                  <div
                    key={index}
                    className={entry.speaker === 'user' 
                      ? "bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-3 rounded"
                      : "bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-500 p-3 rounded"
                    }
                  >
                    <span className="font-semibold mr-2">
                      {entry.speaker === 'user' ? 'Vous' : 'AI'}:
                    </span>
                    <span>{entry.text}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AudioRecorder
        onAudioChunk={handleAudioChunk}
        isActive={!isTimeExpired}
        isDisabled={isTimeExpired}
      />
    </div>
  );
};

