// ===========================================
// LOCATION SERVICE - Geofencing for Reminders
// ===========================================
// Handles location tracking and geofence triggers
// Monitors when user enters/leaves defined locations

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

// Task name for background location
const LOCATION_TASK_NAME = 'background-location-task';
const GEOFENCE_TASK_NAME = 'geofence-task';

// Storage keys
const STORAGE_KEYS = {
  SAVED_LOCATIONS: '@saved_locations',
  LOCATION_REMINDERS: '@location_reminders',
};

// Types
export interface SavedLocation {
  id: string;
  name: string;           // "Home", "Office", etc.
  latitude: number;
  longitude: number;
  radius: number;         // in meters (default 100m)
}

export interface LocationReminder {
  reminderId: string;
  items: string[];
  locationId: string;
  locationName: string;
  triggerOn: 'enter' | 'exit';  // When to trigger
  triggered: boolean;
  isRecurring: boolean;         // If true, triggers every time (not just once)
  lastTriggeredAt?: string;     // ISO timestamp of last trigger (for recurring)
}

// Default geofence radius (100 meters)
const DEFAULT_RADIUS = 100;

// Request location permissions
export async function requestLocationPermissions(): Promise<boolean> {
  try {
    // Request foreground permission first
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.log('Foreground location permission denied');
      return false;
    }

    // Request background permission for geofencing
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.log('Background location permission denied - geofencing will be limited');
      // Still return true - foreground works
    }

    return true;
  } catch (error) {
    console.error('Error requesting location permissions:', error);
    return false;
  }
}

// Get current location
export async function getCurrentLocation(): Promise<Location.LocationObject | null> {
  try {
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) return null;

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return location;
  } catch (error) {
    console.error('Error getting current location:', error);
    return null;
  }
}

// Save a location (Home, Office, etc.)
export async function saveLocation(location: SavedLocation): Promise<void> {
  try {
    const locations = await getSavedLocations();
    const existingIndex = locations.findIndex(l => l.id === location.id);

    if (existingIndex >= 0) {
      locations[existingIndex] = location;
    } else {
      locations.push(location);
    }

    await AsyncStorage.setItem(STORAGE_KEYS.SAVED_LOCATIONS, JSON.stringify(locations));
    console.log('Location saved:', location.name);

    // Update geofences
    await updateGeofences();
  } catch (error) {
    console.error('Error saving location:', error);
  }
}

// Get all saved locations
export async function getSavedLocations(): Promise<SavedLocation[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_LOCATIONS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting saved locations:', error);
    return [];
  }
}

// Delete a saved location
export async function deleteLocation(locationId: string): Promise<void> {
  try {
    const locations = await getSavedLocations();
    const filtered = locations.filter(l => l.id !== locationId);
    await AsyncStorage.setItem(STORAGE_KEYS.SAVED_LOCATIONS, JSON.stringify(filtered));

    // Update geofences
    await updateGeofences();
  } catch (error) {
    console.error('Error deleting location:', error);
  }
}

// Save a location-based reminder
export async function saveLocationReminder(reminder: LocationReminder): Promise<void> {
  try {
    const reminders = await getLocationReminders();
    reminders.push(reminder);
    await AsyncStorage.setItem(STORAGE_KEYS.LOCATION_REMINDERS, JSON.stringify(reminders));
    console.log('Location reminder saved:', reminder);

    // Make sure geofencing is active
    await startGeofencing();
  } catch (error) {
    console.error('Error saving location reminder:', error);
  }
}

// Get all location-based reminders
export async function getLocationReminders(): Promise<LocationReminder[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LOCATION_REMINDERS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting location reminders:', error);
    return [];
  }
}

// Remove a location reminder
export async function removeLocationReminder(reminderId: string): Promise<void> {
  try {
    const reminders = await getLocationReminders();
    const filtered = reminders.filter(r => r.reminderId !== reminderId);
    await AsyncStorage.setItem(STORAGE_KEYS.LOCATION_REMINDERS, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error removing location reminder:', error);
  }
}

// Start geofencing for all saved locations
export async function startGeofencing(): Promise<void> {
  try {
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) {
      console.log('Cannot start geofencing: no permission');
      return;
    }

    const locations = await getSavedLocations();
    if (locations.length === 0) {
      console.log('No saved locations for geofencing');
      return;
    }

    // Create geofence regions
    const regions: Location.LocationRegion[] = locations.map(loc => ({
      identifier: loc.id,
      latitude: loc.latitude,
      longitude: loc.longitude,
      radius: loc.radius || DEFAULT_RADIUS,
      notifyOnEnter: true,
      notifyOnExit: true,
    }));

    // Start geofencing
    await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
    console.log('Geofencing started for', regions.length, 'locations');
  } catch (error) {
    console.error('Error starting geofencing:', error);
  }
}

// Stop geofencing
export async function stopGeofencing(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
    if (isRegistered) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
      console.log('Geofencing stopped');
    }
  } catch (error) {
    console.error('Error stopping geofencing:', error);
  }
}

// Update geofences (call after adding/removing locations)
async function updateGeofences(): Promise<void> {
  await stopGeofencing();
  await startGeofencing();
}

// Parse location trigger from AI response
// Now supports any custom location name from the triggerValue
export function parseLocationTrigger(triggerValue: string): { locationName: string; triggerOn: 'enter' | 'exit' } {
  const lowerTrigger = triggerValue.toLowerCase();

  // Detect if leaving or arriving
  const isLeaving = lowerTrigger.includes('leave') ||
                    lowerTrigger.includes('leaving') ||
                    lowerTrigger.includes('exit') ||
                    lowerTrigger.includes('go to') ||
                    lowerTrigger.includes('heading to');

  const isArriving = lowerTrigger.includes('arrive') ||
                     lowerTrigger.includes('arriving') ||
                     lowerTrigger.includes('reach') ||
                     lowerTrigger.includes('reaching') ||
                     lowerTrigger.includes('get to') ||
                     lowerTrigger.includes('enter');

  // Extract location name from triggerValue
  // The AI should provide it in format like "leaving [location]" or "arriving at [location]"
  // We'll extract the location name by removing action words
  let locationName = triggerValue
    .replace(/leaving|leave|exit|exiting|go to|going to|heading to|head to/gi, '')
    .replace(/arriving|arrive|reaching|reach|get to|getting to|enter|entering|at/gi, '')
    .replace(/when i|when|for|from|the/gi, '')
    .trim();

  // If we couldn't extract a name, default to home
  if (!locationName || locationName.length < 2) {
    locationName = 'home';
  }

  // Determine trigger type
  let triggerOn: 'enter' | 'exit' = 'exit';

  if (isArriving) {
    triggerOn = 'enter';
  } else if (isLeaving) {
    triggerOn = 'exit';
  }

  return { locationName, triggerOn };
}

// Find a saved location by name (case-insensitive, partial match)
export async function findSavedLocationByName(name: string): Promise<SavedLocation | null> {
  const locations = await getSavedLocations();
  const lowerName = name.toLowerCase().trim();

  // First try exact match
  let match = locations.find(l => l.name.toLowerCase() === lowerName);

  // If no exact match, try partial match
  if (!match) {
    match = locations.find(l =>
      l.name.toLowerCase().includes(lowerName) ||
      lowerName.includes(l.name.toLowerCase())
    );
  }

  return match || null;
}

// Define the geofence task handler
TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Geofence task error:', error);
    return;
  }

  if (data) {
    const { eventType, region } = data as {
      eventType: Location.GeofencingEventType;
      region: Location.LocationRegion;
    };

    const locationId = region.identifier;
    const isEntering = eventType === Location.GeofencingEventType.Enter;
    const isExiting = eventType === Location.GeofencingEventType.Exit;

    console.log(`Geofence event: ${isEntering ? 'ENTER' : 'EXIT'} ${locationId}`);

    // Get location reminders
    const reminders = await getLocationReminders();
    const locations = await getSavedLocations();
    const location = locations.find(l => l.id === locationId);

    // Find matching reminders
    for (const reminder of reminders) {
      // Skip if already triggered and not recurring
      if (reminder.triggered && !reminder.isRecurring) continue;

      // For recurring reminders, add cooldown (don't trigger again within 5 minutes)
      if (reminder.isRecurring && reminder.lastTriggeredAt) {
        const lastTrigger = new Date(reminder.lastTriggeredAt).getTime();
        const now = Date.now();
        const cooldownMs = 5 * 60 * 1000; // 5 minutes
        if (now - lastTrigger < cooldownMs) {
          console.log('Skipping recurring reminder - cooldown active');
          continue;
        }
      }

      const shouldTrigger =
        (reminder.locationId === locationId ||
         reminder.locationName.toLowerCase() === location?.name.toLowerCase()) &&
        ((reminder.triggerOn === 'enter' && isEntering) ||
         (reminder.triggerOn === 'exit' && isExiting));

      if (shouldTrigger) {
        // Send notification
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${isExiting ? 'Leaving' : 'Arriving at'} ${location?.name || 'location'}`,
            body: `Don't forget: ${reminder.items.join(', ')}`,
            data: { reminderId: reminder.reminderId, isRecurring: reminder.isRecurring },
            sound: 'default',
          },
          trigger: null, // Immediate
        });

        // Update reminder status
        if (reminder.isRecurring) {
          // For recurring: update last triggered time
          reminder.lastTriggeredAt = new Date().toISOString();
          console.log('Recurring location reminder triggered:', reminder.items);
        } else {
          // For one-time: mark as triggered
          reminder.triggered = true;
          console.log('One-time location reminder triggered:', reminder.items);
        }
      }
    }

    // Save updated reminders
    await AsyncStorage.setItem(STORAGE_KEYS.LOCATION_REMINDERS, JSON.stringify(reminders));
  }
});

// Generate unique ID
export const generateLocationId = () => `loc_${Math.random().toString(36).substring(2, 9)}`;
