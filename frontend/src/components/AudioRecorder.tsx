'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AudioRecorderProps {
  onAudioChunk: (audioData: ArrayBuffer) => void;
  isActive: boolean;
  isDisabled: boolean;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onAudioChunk, isActive, isDisabled }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (isActive && !isDisabled && hasPermission === null) {
      requestMicrophonePermission();
    }

    if (isActive && !isDisabled && hasPermission === true && !isRecording) {
      startRecording();
    }

    if (isDisabled || !isActive) {
      stopRecording();
    }

    return () => {
      stopRecording();
    };
  }, [isActive, isDisabled, hasPermission, isRecording]);

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasPermission(true);
      streamRef.current = stream;
    } catch (error) {
      console.error('Microphone permission denied:', error);
      setHasPermission(false);
    }
  };

  const startRecording = async () => {
    try {
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      }

      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          // Convert blob to ArrayBuffer and send
          event.data.arrayBuffer().then((buffer) => {
            onAudioChunk(buffer);
          });
        }
      };

      mediaRecorder.onstop = () => {
        audioChunksRef.current = [];
      };

      mediaRecorder.start(100); // Collect data every 100ms
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      setHasPermission(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  if (hasPermission === false) {
    return (
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-red-50 dark:bg-red-900/20 border-2 border-red-500 rounded-lg px-6 py-3 text-red-800 dark:text-red-200 font-semibold z-50 max-w-[90%] text-center">
        ❌ Accès au microphone refusé. Veuillez autoriser l'accès au microphone.
      </div>
    );
  }

  return (
    <div className={cn(
      "fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-900 rounded-lg px-6 py-3 shadow-lg z-50 flex items-center gap-3",
      isRecording && "bg-red-50 dark:bg-red-900/20 border-2 border-red-500",
      isDisabled && "bg-gray-100 dark:bg-gray-800 opacity-60"
    )}>
      <div className={cn(
        "w-3 h-3 rounded-full",
        isRecording ? "bg-red-500 animate-pulse" : "bg-gray-400"
      )}></div>
      <span className="font-semibold">
        {isRecording ? 'Enregistrement...' : 'Microphone prêt'}
      </span>
    </div>
  );
};

