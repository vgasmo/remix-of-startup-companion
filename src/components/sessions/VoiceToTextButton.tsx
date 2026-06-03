import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface VoiceToTextButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceToTextButton({ onTranscript, disabled = false }: VoiceToTextButtonProps) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Get supported mimeType for MediaRecorder
  const getSupportedMimeType = useCallback((): string => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/wav',
      ''  // Empty string means browser default
    ];
    
    for (const type of types) {
      if (type === '' || MediaRecorder.isTypeSupported(type)) {
        // Dev-only logging for mimeType debugging
        if (import.meta.env.DEV) {
          logger.debug('voice_mime_type', { type: type || 'browser default' });
        }
        return type;
      }
    }
    return '';
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // Check if MediaRecorder is supported
      if (!window.MediaRecorder) {
        notify.error(t('sessions.browserNotSupported', 'Your browser does not support audio recording'));
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (e) {
        logger.warn('voice_recorder_options_failed', { error: String(e) });
        mediaRecorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const actualMimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: actualMimeType });
        stream.getTracks().forEach(track => track.stop());
        await processAudio(audioBlob, actualMimeType);
      };

      mediaRecorder.start(1000); // Capture in 1 second chunks
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error: any) {
      logger.error('Error accessing microphone', {}, error);
      if (error.name === 'NotAllowedError') {
        notify.error(t('sessions.microphonePermissionDenied', 'Microphone permission denied. Please allow access.'));
      } else if (error.name === 'NotFoundError') {
        notify.error(t('sessions.noMicrophoneFound', 'No microphone found on this device.'));
      } else {
        notify.error(t('sessions.microphoneError'));
      }
    }
  }, [t, getSupportedMimeType]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const processAudio = async (audioBlob: Blob, mimeType: string) => {
    setIsProcessing(true);
    
    try {
      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(audioBlob);
      const base64Audio = await base64Promise;

      // Call edge function for transcription with mimeType hint
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { 
          audio: base64Audio,
          mimeType: mimeType,
        },
      });

      if (error) throw error;

      if (data?.text) {
        onTranscript(data.text);
        notify.success(t('sessions.transcriptionComplete'));
      } else {
        notify.error(t('sessions.noSpeechDetected'));
      }
    } catch (error: any) {
      logger.error('Transcription error', {}, error);
      
      if (error.message?.includes('429')) {
        notify.error(t('sessions.rateLimitError'));
      } else if (error.message?.includes('402')) {
        notify.error(t('sessions.creditsError'));
      } else {
        notify.error(t('sessions.transcriptionFailed', 'Transcription failed. Check if the AI service is configured in System Settings.'));
      }
    } finally {
      setIsProcessing(false);
      setRecordingTime(0);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={isRecording ? 'destructive' : 'outline'}
        size="sm"
        onClick={isRecording ? stopRecording : startRecording}
        disabled={disabled || isProcessing}
        className={cn(
          'gap-2',
          isRecording && 'animate-pulse'
        )}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('sessions.processing')}
          </>
        ) : isRecording ? (
          <>
            <Square className="h-4 w-4" />
            {t('sessions.stopRecording')} ({formatTime(recordingTime)})
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" />
            {t('sessions.voiceToText')}
          </>
        )}
      </Button>
      
      {isRecording && (
        <span className="flex items-center gap-1 text-sm text-destructive">
          <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          {t('sessions.recording')}
        </span>
      )}
    </div>
  );
}
