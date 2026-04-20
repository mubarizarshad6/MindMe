// ===========================================
// REMINDER CONTEXT - State Management
// ===========================================
// Manages all reminders, chat history, and notifications

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ParsedReminder, AIResponse, chatWithAI } from '../services/groq';
import {
  scheduleReminderNotification,
  cancelNotification,
  requestNotificationPermissions,
  addNotificationResponseListener,
  addNotificationReceivedListener,
} from '../services/notifications';
import {
  saveLocationReminder,
  removeLocationReminder,
  parseLocationTrigger,
  startGeofencing,
  getSavedLocations,
  findSavedLocationByName,
  LocationReminder,
} from '../services/location';

// Types
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  reminder?: ParsedReminder;
}

interface ReminderContextType {
  // Chat
  messages: ChatMessage[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearChat: () => void;

  // Reminders
  reminders: ParsedReminder[];
  addReminder: (reminder: ParsedReminder) => void;
  updateReminder: (id: string, updates: Partial<ParsedReminder>) => void;
  deleteReminder: (id: string) => void;
  completeReminder: (id: string) => void;

  // Categories
  getOfficeReminders: () => ParsedReminder[];
  getHomeReminders: () => ParsedReminder[];
  getFamilyReminders: () => ParsedReminder[];
  getTodayReminders: () => ParsedReminder[];
}

// Create context
const ReminderContext = createContext<ReminderContextType | undefined>(undefined);

// Storage keys
const STORAGE_KEYS = {
  REMINDERS: '@ai_reminders',
  MESSAGES: '@ai_messages',
};

// Generate ID
const generateId = () => Math.random().toString(36).substring(2, 9);

// Provider component
export function ReminderProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reminders, setReminders] = useState<ParsedReminder[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load data on mount and setup notifications
  useEffect(() => {
    loadData();
    setupNotifications();
    setupGeofencing();
  }, []);

  // Setup geofencing for location-based reminders
  const setupGeofencing = async () => {
    try {
      const locations = await getSavedLocations();
      if (locations.length > 0) {
        await startGeofencing();
        console.log('Geofencing initialized with', locations.length, 'locations');
      }
    } catch (error) {
      console.error('Error setting up geofencing:', error);
    }
  };

  // Setup notification listeners
  const setupNotifications = async () => {
    // Request permissions
    await requestNotificationPermissions();

    // Listen for notification taps
    const responseSubscription = addNotificationResponseListener((response) => {
      const reminderId = response.notification.request.content.data?.reminderId;
      console.log('Notification tapped, reminder ID:', reminderId);
      // Could navigate to the reminder or mark as seen
    });

    // Listen for notifications while app is open
    const receivedSubscription = addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification.request.content.title);
    });

    // Cleanup on unmount
    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    };
  };

  // Save data whenever it changes
  useEffect(() => {
    saveData();
  }, [reminders, messages]);

  // Load from AsyncStorage
  const loadData = async () => {
    try {
      const [savedReminders, savedMessages] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.REMINDERS),
        AsyncStorage.getItem(STORAGE_KEYS.MESSAGES),
      ]);

      if (savedReminders) {
        setReminders(JSON.parse(savedReminders));
      }

      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      } else {
        // Add welcome message if no history
        setMessages([
          {
            id: generateId(),
            role: 'assistant',
            content: "Hi! I'm your AI life assistant. Tell me what you need to remember - things for office, errands, or requests from family. Just talk naturally!",
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  // Save to AsyncStorage
  const saveData = async () => {
    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.REMINDERS, JSON.stringify(reminders)),
        AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages)),
      ]);
    } catch (error) {
      console.error('Error saving data:', error);
    }
  };

  // Send message to AI
  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    setIsLoading(true);

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      // Build conversation history for AI context (last 20 messages)
      const currentMessages = [...messages, userMessage];
      const conversationHistory = currentMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

      // Get AI response with conversation history
      const aiResponse: AIResponse = await chatWithAI(text, conversationHistory);

      // Add AI message
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: aiResponse.message,
        timestamp: new Date().toISOString(),
        reminder: aiResponse.reminder,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // If it's a reminder, save it (handle both single and multiple)
      if (aiResponse.isReminder) {
        if (aiResponse.reminders && aiResponse.reminders.length > 0) {
          // Multiple reminders from a list
          for (const rem of aiResponse.reminders) {
            addReminder(rem);
          }
        } else if (aiResponse.reminder) {
          addReminder(aiResponse.reminder);
        }
      }
    } catch (error) {
      // Add error message
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: "Sorry, I couldn't process that. Please try again!",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Clear chat history
  const clearChat = () => {
    setMessages([
      {
        id: generateId(),
        role: 'assistant',
        content: "Chat cleared! What do you need to remember?",
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  // Add reminder and schedule notification
  const addReminder = async (reminder: ParsedReminder) => {
    // Handle location-based reminders
    if (reminder.trigger === 'location' && reminder.triggerValue) {
      const { locationName, triggerOn } = parseLocationTrigger(reminder.triggerValue);

      // Find matching saved location (supports custom location names)
      const matchedLocation = await findSavedLocationByName(locationName);

      if (matchedLocation) {
        // Save as location reminder for geofencing
        const locationReminder: LocationReminder = {
          reminderId: reminder.id,
          items: reminder.items,
          locationId: matchedLocation.id,
          locationName: matchedLocation.name,
          triggerOn,
          triggered: false,
          isRecurring: reminder.isRecurring ?? false,  // Support recurring location reminders
        };
        await saveLocationReminder(locationReminder);
        console.log('Location reminder saved:', locationReminder);
      } else {
        console.log(`Location "${locationName}" not saved. Reminder will be manual.`);
      }
    }
    // Handle time-based reminders
    else if (reminder.scheduleType && reminder.scheduleType !== 'manual') {
      const notificationId = await scheduleReminderNotification(reminder);
      if (notificationId) {
        reminder.notificationId = notificationId;
        console.log('Reminder scheduled with notification ID:', notificationId);
      }
    }

    setReminders((prev) => [...prev, reminder]);
  };

  // Update an existing reminder
  const updateReminder = async (id: string, updates: Partial<ParsedReminder>) => {
    const existingReminder = reminders.find((r) => r.id === id);
    if (!existingReminder) return;

    // Cancel existing notification if any
    if (existingReminder.notificationId) {
      await cancelNotification(existingReminder.notificationId);
    }

    // Remove existing location reminder if it was location-based
    if (existingReminder.trigger === 'location') {
      await removeLocationReminder(id);
    }

    // Create updated reminder
    const updatedReminder = { ...existingReminder, ...updates };

    // Handle location-based reminders
    if (updatedReminder.trigger === 'location' && updatedReminder.triggerValue) {
      const { locationName, triggerOn } = parseLocationTrigger(updatedReminder.triggerValue);
      const matchedLocation = await findSavedLocationByName(locationName);

      if (matchedLocation) {
        const locationReminder: LocationReminder = {
          reminderId: updatedReminder.id,
          items: updatedReminder.items,
          locationId: matchedLocation.id,
          locationName: matchedLocation.name,
          triggerOn,
          triggered: false,
          isRecurring: updatedReminder.isRecurring ?? false,
        };
        await saveLocationReminder(locationReminder);
      }
    }
    // Handle time-based reminders
    else if (updatedReminder.scheduleType && updatedReminder.scheduleType !== 'manual') {
      const notificationId = await scheduleReminderNotification(updatedReminder);
      if (notificationId) {
        updatedReminder.notificationId = notificationId;
      }
    }

    setReminders((prev) => prev.map((r) => (r.id === id ? updatedReminder : r)));
  };

  // Delete reminder and cancel its notification
  const deleteReminder = async (id: string) => {
    const reminder = reminders.find((r) => r.id === id);
    if (reminder?.notificationId) {
      await cancelNotification(reminder.notificationId);
    }
    // Also remove location reminder if exists
    if (reminder?.trigger === 'location') {
      await removeLocationReminder(id);
    }
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  // Complete reminder (removes it and cancels notification)
  const completeReminder = async (id: string) => {
    const reminder = reminders.find((r) => r.id === id);
    if (reminder?.notificationId) {
      await cancelNotification(reminder.notificationId);
    }
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  // Filter functions
  const getOfficeReminders = () => reminders.filter((r) => r.category === 'office');
  const getHomeReminders = () => reminders.filter((r) => r.category === 'home');
  const getFamilyReminders = () => reminders.filter((r) => r.category === 'family');

  const getTodayReminders = () => {
    const today = new Date().toDateString();
    return reminders.filter((r) => {
      const reminderDate = new Date(r.createdAt).toDateString();
      return reminderDate === today;
    });
  };

  return (
    <ReminderContext.Provider
      value={{
        messages,
        isLoading,
        sendMessage,
        clearChat,
        reminders,
        addReminder,
        updateReminder,
        deleteReminder,
        completeReminder,
        getOfficeReminders,
        getHomeReminders,
        getFamilyReminders,
        getTodayReminders,
      }}
    >
      {children}
    </ReminderContext.Provider>
  );
}

// Hook to use context
export function useReminders() {
  const context = useContext(ReminderContext);
  if (context === undefined) {
    throw new Error('useReminders must be used within a ReminderProvider');
  }
  return context;
}
