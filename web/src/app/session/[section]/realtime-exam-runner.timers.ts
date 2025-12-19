import type { Dispatch, SetStateAction } from "react";
import type { MutableRefObject } from "react";

export interface TimerRefs {
  timer: MutableRefObject<number | null>;
  prepTimer: MutableRefObject<number | null>;
  timeoutHandled: MutableRefObject<boolean>;
  warn60Sent: MutableRefObject<boolean>;
  warn10Sent: MutableRefObject<boolean>;
}

export interface TimerSetters {
  setSecondsLeft: Dispatch<SetStateAction<number>>;
  setPrepSecondsLeft: Dispatch<SetStateAction<number>>;
}

export function stopTimer(refs: TimerRefs) {
  if (refs.timer.current) {
    window.clearInterval(refs.timer.current);
    refs.timer.current = null;
  }
}

export function stopPrepTimer(refs: TimerRefs) {
  if (refs.prepTimer.current) {
    window.clearInterval(refs.prepTimer.current);
    refs.prepTimer.current = null;
  }
}

export function startTimer(
  timeLimitSec: number,
  refs: TimerRefs,
  setters: TimerSetters,
  stopTimerFn: (refs: TimerRefs) => void,
) {
  stopTimerFn(refs);
  setters.setSecondsLeft(timeLimitSec);
  refs.timeoutHandled.current = false;
  refs.warn60Sent.current = false;
  refs.warn10Sent.current = false;
  refs.timer.current = window.setInterval(() => {
    setters.setSecondsLeft((s) => {
      if (s <= 1) return 0;
      return s - 1;
    });
  }, 1000);
}

export function startPrepTimer(refs: TimerRefs, setters: TimerSetters, stopPrepTimerFn: (refs: TimerRefs) => void) {
  stopPrepTimerFn(refs);
  setters.setPrepSecondsLeft(60);
  refs.prepTimer.current = window.setInterval(() => {
    setters.setPrepSecondsLeft((s) => {
      if (s <= 1) return 0;
      return s - 1;
    });
  }, 1000);
}

