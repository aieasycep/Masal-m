import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';

/**
 * Voice recording wrapper around expo-audio (§ project convention: expo-audio
 * ONLY records — playback belongs to RNTP). Produces .m4a (AAC) files via the
 * HIGH_QUALITY preset with metering enabled for the live waveform + mic test.
 */

export type VoiceRecorderState = 'idle' | 'recording' | 'paused' | 'stopped';

export interface StoppedRecording {
  /** Local file uri (kept on disk — survives a failed upload). */
  uri: string;
  durationSeconds: number;
}

export interface VoiceRecorder {
  state: VoiceRecorderState;
  /** Elapsed recording time in seconds (pause-aware, ~500ms resolution). */
  durationSeconds: number;
  /** Latest metering level in dBFS (negative; ~0 = loud), or null when unavailable. */
  meteringDb: number | null;
  /** Requests mic permission. Resolves true when granted. */
  requestPermission: () => Promise<boolean>;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  /** Stops and finalizes the file. Returns null if no recording was produced. */
  stop: () => Promise<StoppedRecording | null>;
  /** Back to 'idle' for a fresh take. Never deletes previously stopped files. */
  reset: () => void;
}

const STATUS_POLL_MS = 500;

/** Recording options: HIGH_QUALITY preset (.m4a AAC) + metering for the waveform. */
const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
} as const;

export const VOICE_RECORDING_CONTENT_TYPE = 'audio/m4a' as const;

export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [meteringDb, setMeteringDb] = useState<number | null>(null);
  // Mirrors `durationSeconds` for use inside stop() without a stale closure.
  const durationRef = useRef(0);

  // Poll the native recorder status while active: drives the timer + waveform.
  useEffect(() => {
    if (state !== 'recording' && state !== 'paused') return;
    const readStatus = () => {
      try {
        const status = recorder.getStatus();
        const seconds = status.durationMillis / 1000;
        if (Number.isFinite(seconds) && seconds >= 0) {
          durationRef.current = seconds;
          setDurationSeconds(seconds);
        }
        setMeteringDb(
          state === 'recording' && typeof status.metering === 'number'
            ? status.metering
            : null,
        );
      } catch {
        // Recorder released mid-poll — the next state change clears the interval.
      }
    };
    readStatus();
    const interval = setInterval(readStatus, STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [state, recorder]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const response = await AudioModule.requestRecordingPermissionsAsync();
    return response.granted;
  }, []);

  const start = useCallback(async () => {
    // iOS records only when the session allows it; harmless elsewhere.
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    durationRef.current = 0;
    setDurationSeconds(0);
    setMeteringDb(null);
    setState('recording');
  }, [recorder]);

  const pause = useCallback(() => {
    recorder.pause();
    setMeteringDb(null);
    setState('paused');
  }, [recorder]);

  const resume = useCallback(() => {
    recorder.record();
    setState('recording');
  }, [recorder]);

  const stop = useCallback(async (): Promise<StoppedRecording | null> => {
    // Capture the duration before stop — the native status resets afterwards.
    try {
      const status = recorder.getStatus();
      const seconds = status.durationMillis / 1000;
      if (Number.isFinite(seconds) && seconds > 0) {
        durationRef.current = seconds;
        setDurationSeconds(seconds);
      }
    } catch {
      // Keep the last polled value.
    }
    await recorder.stop();
    // Release the record-capable session; playback elsewhere (RNTP) routes normally.
    void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    setMeteringDb(null);
    setState('stopped');
    const uri = recorder.uri;
    if (uri == null || uri.length === 0) return null;
    return { uri, durationSeconds: durationRef.current };
  }, [recorder]);

  const reset = useCallback(() => {
    durationRef.current = 0;
    setDurationSeconds(0);
    setMeteringDb(null);
    setState('idle');
  }, []);

  return { state, durationSeconds, meteringDb, requestPermission, start, pause, resume, stop, reset };
}
