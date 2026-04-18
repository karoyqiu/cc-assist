import { useEffect, useRef } from 'react';

type SessionState = 'idle' | 'running' | 'waiting_permission' | 'waiting_input';

/**
 * Plays a notification sound when the session transitions to a state
 * that requires user attention (waiting_permission, waiting_input, idle)
 * while the window is not focused.
 */
export function useNotificationSound(sessionId: string | null, state: SessionState) {
  const lastFocusedRef = useRef(true);

  useEffect(() => {
    const handleFocus = () => {
      lastFocusedRef.current = true;
    };
    const handleBlur = () => {
      lastFocusedRef.current = false;
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    // Play sound on state transitions to attention-required states
    // when the window is not focused
    const shouldPlay =
      (state === 'waiting_permission' || state === 'waiting_input' || state === 'idle') &&
      !lastFocusedRef.current;

    if (shouldPlay) {
      playNotificationSound();
    }
  }, [sessionId, state]);
}

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    oscillator.type = 'sine';

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);

    // Clean up AudioContext after sound finishes
    const cleanup = () => {
      try {
        ctx.close();
      } catch {
        // already closed
      }
    };
    oscillator.onended = cleanup;
    // Fallback: close after max 1 second
    setTimeout(cleanup, 1000);
  } catch {
    // AudioContext not available — silently ignore
  }
}
