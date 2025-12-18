'use client';

import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TimerProps {
  initialSeconds: number;
  onExpire: () => void;
  isActive: boolean;
}

export const Timer: React.FC<TimerProps> = ({ initialSeconds, onExpire, isActive }) => {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isWarning, setIsWarning] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!isActive) return;

    if (seconds <= 0) {
      if (!isExpired) {
        setIsExpired(true);
        onExpire();
      }
      return;
    }

    if (seconds <= 30) {
      setIsWarning(true);
    }

    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [seconds, isActive, isExpired, onExpire]);

  const formatTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn(
      "fixed top-8 right-8 bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg z-50 text-center transition-all",
      isWarning && !isExpired && "bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-500 animate-pulse",
      isExpired && "bg-red-50 dark:bg-red-900/20 border-2 border-red-500 animate-pulse"
    )}>
      <div className={cn(
        "text-4xl font-bold font-mono tabular-nums",
        isWarning && !isExpired && "text-yellow-700 dark:text-yellow-300",
        isExpired && "text-red-700 dark:text-red-300",
        !isWarning && !isExpired && "text-gray-900 dark:text-gray-100"
      )}>
        {formatTime(seconds)}
      </div>
      {isWarning && !isExpired && (
        <Badge variant="outline" className="mt-2 text-yellow-700 dark:text-yellow-300 border-yellow-500">
          Temps restant
        </Badge>
      )}
      {isExpired && (
        <Badge variant="destructive" className="mt-2">
          Temps écoulé
        </Badge>
      )}
    </div>
  );
};

