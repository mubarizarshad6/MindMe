import { useState, useRef } from 'react';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

if (!GROQ_API_KEY) {
  throw new Error('EXPO_PUBLIC_GROQ_API_KEY is not set. Copy .env.example to .env and fill it in.');
}

interface UseVoiceReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  isSpeaking: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  speak: (text: string) => void;
  stopSpeaking: () => void;
}

export function useVoice(): UseVoiceReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingStartTime = useRef<number>(0);

  // Request microphone permission and start recording
  const startRecording = async () => {
    try {
      // Request permission
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Microphone permission denied');
        return;
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Create and start recording with specific settings for Whisper
      const { recording } = await Audio.Recording.createAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      });

      recordingRef.current = recording;
      recordingStartTime.current = Date.now();
      setIsRecording(true);
      console.log('Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  // Stop recording and transcribe using Groq Whisper API
  const stopRecording = async (): Promise<string | null> => {
    if (!recordingRef.current) return null;

    setIsRecording(false);

    // Check minimum recording duration (at least 1 second)
    const recordingDuration = Date.now() - recordingStartTime.current;
    if (recordingDuration < 1000) {
      console.log('Recording too short, ignoring');
      await recordingRef.current.stopAndUnloadAsync();
      recordingRef.current = null;
      return null;
    }

    setIsTranscribing(true);

    try {
      // Stop the recording
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        setIsTranscribing(false);
        return null;
      }

      console.log('Recording stopped, URI:', uri, 'Duration:', recordingDuration, 'ms');

      // Create form data for Groq Whisper API
      const formData = new FormData();
      formData.append('file', {
        uri: uri,
        type: 'audio/m4a',
        name: 'audio.m4a',
      } as any);
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'en');

      // Send to Groq Whisper API
      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Whisper API error:', error);
        setIsTranscribing(false);
        return null;
      }

      const result = await response.json();
      console.log('Transcription:', result.text);

      setIsTranscribing(false);
      return result.text || null;

    } catch (error) {
      console.error('Transcription error:', error);
      setIsTranscribing(false);
      return null;
    }
  };

  // Text-to-speech - AI speaks back
  const speak = (text: string) => {
    // Stop any ongoing speech
    Speech.stop();

    setIsSpeaking(true);
    Speech.speak(text, {
      language: 'en-US',
      pitch: 1.0,
      rate: 0.9,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  // Stop speaking
  const stopSpeaking = () => {
    Speech.stop();
    setIsSpeaking(false);
  };

  return {
    isRecording,
    isTranscribing,
    isSpeaking,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
  };
}
