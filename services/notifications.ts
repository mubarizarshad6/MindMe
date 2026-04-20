// ===========================================
// NOTIFICATION SERVICE
// ===========================================
// Handles scheduling and managing local notifications
// Supports: once, daily, weekly, and manual reminders

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ParsedReminder, ScheduleType } from './groq';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Request notification permissions
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Notification permission denied');
    return false;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366f1',
      sound: 'default',
    });
  }

  return true;
}

// Schedule a notification for a reminder
export async function scheduleReminderNotification(
  reminder: ParsedReminder
): Promise<string | null> {
  try {
    // Request permissions first
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.log('Cannot schedule notification: no permission');
      return null;
    }

    const itemsList = reminder.items.join(', ');
    const notificationContent = {
      title: 'Reminder',
      body: `Don't forget: ${itemsList}`,
      data: { reminderId: reminder.id },
      sound: 'default' as const,
    };

    let notificationId: string | null = null;

    switch (reminder.scheduleType) {
      case 'once':
        notificationId = await scheduleOnceNotification(reminder, notificationContent);
        break;

      case 'daily':
        notificationId = await scheduleDailyNotification(reminder, notificationContent);
        break;

      case 'weekly':
        notificationId = await scheduleWeeklyNotification(reminder, notificationContent);
        break;

      case 'manual':
      default:
        // Manual reminders don't get scheduled automatically
        console.log('Manual reminder - no notification scheduled');
        return null;
    }

    console.log('Notification scheduled with ID:', notificationId);
    return notificationId;

  } catch (error) {
    console.error('Error scheduling notification:', error);
    return null;
  }
}

// Schedule a one-time notification
async function scheduleOnceNotification(
  reminder: ParsedReminder,
  content: { title: string; body: string; data: any; sound: 'default' }
): Promise<string> {
  if (reminder.scheduledTime) {
    const triggerDate = new Date(reminder.scheduledTime);
    const secondsUntil = Math.max(1, Math.floor((triggerDate.getTime() - Date.now()) / 1000));

    console.log(`Scheduling one-time notification in ${secondsUntil} seconds`);

    return await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntil,
      },
    });
  }

  // Fallback: schedule for 1 minute from now
  return await Notifications.scheduleNotificationAsync({
    content,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 60,
    },
  });
}

// Schedule a daily notification
async function scheduleDailyNotification(
  reminder: ParsedReminder,
  content: { title: string; body: string; data: any; sound: 'default' }
): Promise<string> {
  if (reminder.scheduledTime) {
    const triggerDate = new Date(reminder.scheduledTime);

    return await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: triggerDate.getHours(),
        minute: triggerDate.getMinutes(),
      },
    });
  }

  // Fallback: daily at 9 AM
  return await Notifications.scheduleNotificationAsync({
    content,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 9,
      minute: 0,
    },
  });
}

// Schedule weekly notifications
async function scheduleWeeklyNotification(
  reminder: ParsedReminder,
  content: { title: string; body: string; data: any; sound: 'default' }
): Promise<string> {
  const weekDays = reminder.weekDays || [1]; // Default to Monday
  const triggerDate = reminder.scheduledTime ? new Date(reminder.scheduledTime) : new Date();
  const hour = triggerDate.getHours() || 9;
  const minute = triggerDate.getMinutes() || 0;

  // Schedule for the first day in the list
  // Note: For multiple days, you'd need to schedule multiple notifications
  const weekday = weekDays[0];

  return await Notifications.scheduleNotificationAsync({
    content,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: weekday + 1, // expo-notifications uses 1-7 (Sun=1), we use 0-6
      hour,
      minute,
    },
  });
}

// Cancel a scheduled notification
export async function cancelNotification(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log('Notification cancelled:', notificationId);
  } catch (error) {
    console.error('Error cancelling notification:', error);
  }
}

// Cancel all notifications
export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('All notifications cancelled');
  } catch (error) {
    console.error('Error cancelling all notifications:', error);
  }
}

// Get all scheduled notifications
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  return await Notifications.getAllScheduledNotificationsAsync();
}

// Listen for notification responses (when user taps notification)
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

// Listen for notifications received while app is open
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}
