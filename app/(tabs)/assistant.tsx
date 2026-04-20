// ===========================================
// CHAT SCREEN - Talk to your AI Assistant
// ===========================================
// Now with VOICE input! Hold the mic button to speak.

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useReminders } from '../../context/ReminderContext';
import { useVoice } from '../../hooks/useVoice';

export default function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const { messages, isLoading, sendMessage } = useReminders();
  const { isRecording, isTranscribing, isSpeaking, startRecording, stopRecording, speak, stopSpeaking } = useVoice();
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Send message
  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const text = inputText;
    setInputText('');
    await sendMessage(text);

    // Scroll to bottom
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // Common Whisper hallucinations to filter out
  const HALLUCINATIONS = [
    'thank you', 'thanks', 'thank you.', 'thanks.',
    'you', 'bye', 'goodbye', 'hello', 'hi',
    'thank you for watching', 'thanks for watching',
    'subscribe', 'like and subscribe',
    '', ' '
  ];

  // Handle voice button press
  const handleVoicePress = async () => {
    if (isRecording) {
      // Stop recording and get transcription
      const transcription = await stopRecording();
      if (transcription) {
        const cleanText = transcription.trim().toLowerCase();

        // Filter out hallucinations
        if (HALLUCINATIONS.includes(cleanText) || cleanText.length < 3) {
          console.log('Filtered out hallucination:', transcription);
          // Don't send, just show a hint
          return;
        }

        // Put in input field for user to review before sending
        setInputText(transcription);
        // Don't auto-send - let user review and press send
      }
    } else {
      // Start recording
      await startRecording();
    }
  };

  // Speak the last AI message when it arrives
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      // If last message is from AI and we just got it, speak it
      if (lastMessage.role === 'assistant' && !isLoading) {
        // Only auto-speak if it's a recent message (within 2 seconds)
        const messageTime = new Date(lastMessage.timestamp).getTime();
        const now = Date.now();
        if (now - messageTime < 2000) {
          speak(lastMessage.content);
        }
      }
    }
  }, [messages, isLoading]);

  // Render chat bubble
  const renderMessage = ({ item }: { item: any }) => {
    const isUser = item.role === 'user';

    return (
      <View
        style={[
          styles.messageContainer,
          isUser ? styles.userMessage : styles.assistantMessage,
        ]}
      >
        {!isUser && (
          <View style={styles.avatarContainer}>
            <Ionicons name="sparkles" size={20} color="#6366f1" />
          </View>
        )}
        <View
          style={[
            styles.bubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          <Text style={[styles.messageText, isUser && styles.userText]}>
            {item.content}
          </Text>

          {/* Show reminder card if present */}
          {item.reminder && (
            <View style={styles.reminderCard}>
              <View style={styles.reminderHeader}>
                <Ionicons name="notifications" size={16} color="#6366f1" />
                <Text style={styles.reminderTitle}>Reminder Added</Text>
              </View>
              <View style={styles.reminderItems}>
                {item.reminder.items.map((reminderItem: string, index: number) => (
                  <View key={index} style={styles.reminderItem}>
                    <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                    <Text style={styles.reminderItemText}>{reminderItem}</Text>
                  </View>
                ))}
              </View>
              {item.reminder.triggerValue && (
                <Text style={styles.triggerText}>
                  {item.reminder.triggerValue}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Speaker button for AI messages */}
        {!isUser && (
          <TouchableOpacity
            style={styles.speakerButton}
            onPress={() => isSpeaking ? stopSpeaking() : speak(item.content)}
          >
            <Ionicons
              name={isSpeaking ? 'volume-mute' : 'volume-medium'}
              size={18}
              color="#64748b"
            />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Quick suggestions
  const suggestions = [
    "Remind me about keys when leaving",
    "Bring milk today",
    "Wife asked for groceries",
  ];

  const handleSuggestion = (text: string) => {
    setInputText(text);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="sparkles" size={28} color="#6366f1" />
        <Text style={styles.headerTitle}>MindMe</Text>
        {isSpeaking && (
          <TouchableOpacity onPress={stopSpeaking} style={styles.stopSpeakingButton}>
            <Ionicons name="volume-mute" size={20} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>

      {/* Recording Indicator */}
      {(isRecording || isTranscribing) && (
        <View style={styles.recordingBanner}>
          <Animated.View style={[styles.recordingDot, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.recordingText}>
            {isRecording ? 'Listening... Tap mic to stop' : 'Transcribing...'}
          </Text>
        </View>
      )}

      {/* Chat Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />

      {/* Quick Suggestions (show if few messages) */}
      {messages.length <= 2 && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsTitle}>Try saying:</Text>
          <View style={styles.suggestions}>
            {suggestions.map((suggestion, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionChip}
                onPress={() => handleSuggestion(suggestion)}
              >
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Input Area */}
      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.inputWrapper}>
          {/* Voice Button */}
          <TouchableOpacity
            style={[
              styles.voiceButton,
              isRecording && styles.voiceButtonRecording,
            ]}
            onPress={handleVoicePress}
            disabled={isTranscribing || isLoading}
          >
            {isTranscribing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons
                name={isRecording ? 'stop' : 'mic'}
                size={24}
                color="#fff"
              />
            )}
          </TouchableOpacity>

          {/* Text Input */}
          <TextInput
            style={styles.input}
            placeholder="Type or tap mic to speak..."
            placeholderTextColor="#9ca3af"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            multiline
            maxLength={500}
          />

          {/* Send Button */}
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  stopSpeakingButton: {
    position: 'absolute',
    right: 16,
    padding: 8,
  },
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc262620',
    paddingVertical: 10,
    gap: 10,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
  recordingText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  assistantMessage: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  bubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#6366f1',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#1e293b',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    color: '#e2e8f0',
    lineHeight: 22,
  },
  userText: {
    color: '#fff',
  },
  speakerButton: {
    padding: 8,
    marginLeft: 4,
  },
  reminderCard: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366f1',
  },
  reminderItems: {
    gap: 4,
  },
  reminderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reminderItemText: {
    fontSize: 14,
    color: '#e2e8f0',
  },
  triggerText: {
    marginTop: 8,
    fontSize: 13,
    color: '#94a3b8',
  },
  suggestionsContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  suggestionsTitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 10,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  suggestionText: {
    fontSize: 14,
    color: '#e2e8f0',
  },
  inputContainer: {
    padding: 16,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#1e293b',
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  voiceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceButtonRecording: {
    backgroundColor: '#ef4444',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    maxHeight: 100,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#4b5563',
  },
});
