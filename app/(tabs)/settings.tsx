// ===========================================
// SETTINGS SCREEN - Configure Locations
// ===========================================
// Save custom locations for geofencing using map, search, or coordinates

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  SavedLocation,
  getSavedLocations,
  saveLocation,
  deleteLocation,
  getCurrentLocation,
  generateLocationId,
  startGeofencing,
  requestLocationPermissions,
} from '../../services/location';
import LocationPicker, { SelectedLocation } from '../../components/LocationPicker';

// Common location suggestions
const LOCATION_SUGGESTIONS = [
  { name: 'Home', icon: 'home' as const },
  { name: 'Office', icon: 'business' as const },
  { name: 'Gym', icon: 'fitness' as const },
  { name: 'School', icon: 'school' as const },
  { name: 'Market', icon: 'cart' as const },
  { name: 'Hospital', icon: 'medical' as const },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [savingLocation, setSavingLocation] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [customLocationName, setCustomLocationName] = useState('');
  const [customRadius, setCustomRadius] = useState('100');
  const [selectedMapLocation, setSelectedMapLocation] = useState<SelectedLocation | null>(null);
  const [inputMethod, setInputMethod] = useState<'current' | 'map'>('current');

  // Load saved locations on mount
  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    const locations = await getSavedLocations();
    setSavedLocations(locations);
  };

  // Save location with selected coordinates
  const handleSaveLocation = async (locationName: string, radius: number = 100) => {
    if (!locationName.trim()) {
      Alert.alert('Error', 'Please enter a location name');
      return;
    }

    setSavingLocation(locationName);
    setShowAddModal(false);

    try {
      let latitude: number;
      let longitude: number;

      if (inputMethod === 'map' && selectedMapLocation) {
        // Use map-selected location
        latitude = selectedMapLocation.latitude;
        longitude = selectedMapLocation.longitude;
      } else {
        // Use current GPS location
        const hasPermission = await requestLocationPermissions();
        if (!hasPermission) {
          Alert.alert(
            'Permission Required',
            'Location permission is needed to save your current location. Please enable it in settings.'
          );
          setSavingLocation(null);
          return;
        }

        const currentLocation = await getCurrentLocation();
        if (!currentLocation) {
          Alert.alert('Error', 'Could not get your current location. Please try again.');
          setSavingLocation(null);
          return;
        }

        latitude = currentLocation.coords.latitude;
        longitude = currentLocation.coords.longitude;
      }

      // Check if location name already exists
      const existing = savedLocations.find(
        l => l.name.toLowerCase() === locationName.toLowerCase()
      );

      const newLocation: SavedLocation = {
        id: existing?.id || generateLocationId(),
        name: locationName.trim(),
        latitude,
        longitude,
        radius: radius,
      };

      await saveLocation(newLocation);
      await loadLocations();

      // Start geofencing
      await startGeofencing();

      Alert.alert(
        'Location Saved!',
        `"${locationName}" has been saved. You'll get reminders when you leave or arrive here.`
      );

      // Reset form
      setCustomLocationName('');
      setCustomRadius('100');
      setSelectedMapLocation(null);
      setInputMethod('current');
    } catch (error) {
      console.error('Error saving location:', error);
      Alert.alert('Error', 'Failed to save location. Please try again.');
    } finally {
      setSavingLocation(null);
    }
  };

  // Handle map location selection
  const handleMapLocationSelected = (location: SelectedLocation) => {
    setSelectedMapLocation(location);
    setInputMethod('map');
    setShowMapPicker(false);
  };

  // Delete a saved location
  const handleDeleteLocation = (location: SavedLocation) => {
    Alert.alert(
      'Delete Location',
      `Are you sure you want to delete "${location.name}"? Location-based reminders for this place will stop working.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteLocation(location.id);
            await loadLocations();
          },
        },
      ]
    );
  };

  // Update location (re-save with current GPS)
  const handleUpdateLocation = async (location: SavedLocation) => {
    setSavingLocation(location.name);

    try {
      const hasPermission = await requestLocationPermissions();
      if (!hasPermission) {
        Alert.alert('Permission Required', 'Location permission is needed.');
        setSavingLocation(null);
        return;
      }

      const currentLocation = await getCurrentLocation();
      if (!currentLocation) {
        Alert.alert('Error', 'Could not get your current location.');
        setSavingLocation(null);
        return;
      }

      const updatedLocation: SavedLocation = {
        ...location,
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };

      await saveLocation(updatedLocation);
      await loadLocations();
      await startGeofencing();

      Alert.alert('Updated!', `"${location.name}" location has been updated.`);
    } catch (error) {
      Alert.alert('Error', 'Failed to update location.');
    } finally {
      setSavingLocation(null);
    }
  };

  // Check if a suggestion is already saved
  const isSuggestionSaved = (name: string) => {
    return savedLocations.some(l => l.name.toLowerCase() === name.toLowerCase());
  };

  // Get icon for a location
  const getLocationIcon = (name: string): keyof typeof Ionicons.glyphMap => {
    const suggestion = LOCATION_SUGGESTIONS.find(
      s => s.name.toLowerCase() === name.toLowerCase()
    );
    return suggestion?.icon || 'location';
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="settings" size={28} color="#6366f1" />
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* My Locations Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Locations</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionDescription}>
          Save locations to enable reminders like "remind me when I leave home" or "remind me when I reach market"
        </Text>

        {/* Saved Locations */}
        {savedLocations.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="location-outline" size={48} color="#64748b" />
            <Text style={styles.emptyStateText}>No locations saved yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Tap the + button to add your first location
            </Text>
          </View>
        ) : (
          savedLocations.map((location) => {
            const isSaving = savingLocation === location.name;
            return (
              <View key={location.id} style={styles.locationCard}>
                <View style={styles.locationInfo}>
                  <View style={styles.locationIconSaved}>
                    <Ionicons
                      name={getLocationIcon(location.name)}
                      size={24}
                      color="#fff"
                    />
                  </View>
                  <View style={styles.locationDetails}>
                    <Text style={styles.locationName}>{location.name}</Text>
                    <Text style={styles.locationCoords}>
                      {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                    </Text>
                    <Text style={styles.locationStatus}>
                      {location.radius}m radius
                    </Text>
                  </View>
                </View>

                <View style={styles.locationActions}>
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#6366f1" />
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleUpdateLocation(location)}
                      >
                        <Ionicons name="refresh" size={22} color="#6366f1" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleDeleteLocation(location)}
                      >
                        <Ionicons name="trash" size={22} color="#ef4444" />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Quick Add Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Add</Text>
        <Text style={styles.sectionDescription}>
          Tap a suggestion to save your current location with that name
        </Text>
        <View style={styles.suggestionsGrid}>
          {LOCATION_SUGGESTIONS.filter(s => !isSuggestionSaved(s.name)).map((suggestion) => {
            const isSaving = savingLocation === suggestion.name;
            return (
              <TouchableOpacity
                key={suggestion.name}
                style={styles.suggestionChip}
                onPress={() => handleSaveLocation(suggestion.name)}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#6366f1" />
                ) : (
                  <>
                    <Ionicons name={suggestion.icon} size={18} color="#6366f1" />
                    <Text style={styles.suggestionText}>{suggestion.name}</Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Instructions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How it works</Text>
        <View style={styles.instructionList}>
          <View style={styles.instruction}>
            <View style={styles.instructionNumber}>
              <Text style={styles.instructionNumberText}>1</Text>
            </View>
            <Text style={styles.instructionText}>
              Tap + to add a location using GPS, map, or coordinates
            </Text>
          </View>
          <View style={styles.instruction}>
            <View style={styles.instructionNumber}>
              <Text style={styles.instructionNumberText}>2</Text>
            </View>
            <Text style={styles.instructionText}>
              Give it any name (e.g., "Mom's House", "Grocery Store")
            </Text>
          </View>
          <View style={styles.instruction}>
            <View style={styles.instructionNumber}>
              <Text style={styles.instructionNumberText}>3</Text>
            </View>
            <Text style={styles.instructionText}>
              Tell the assistant: "Remind me to buy milk when I reach Grocery Store"
            </Text>
          </View>
          <View style={styles.instruction}>
            <View style={styles.instructionNumber}>
              <Text style={styles.instructionNumberText}>4</Text>
            </View>
            <Text style={styles.instructionText}>
              Get notified automatically when you arrive or leave!
            </Text>
          </View>
        </View>
      </View>

      {/* App Info */}
      <View style={[styles.section, styles.appInfo]}>
        <Text style={styles.appInfoText}>AI Life Assistant v1.0</Text>
        <Text style={styles.appInfoSubtext}>
          Powered by Groq AI
        </Text>
      </View>

      {/* Add Location Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Location</Text>
              <TouchableOpacity onPress={() => {
                setShowAddModal(false);
                setSelectedMapLocation(null);
                setInputMethod('current');
              }}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Location Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g., Mom's House, Grocery Store, Coffee Shop"
              placeholderTextColor="#64748b"
              value={customLocationName}
              onChangeText={setCustomLocationName}
            />

            <Text style={styles.modalLabel}>How to set location?</Text>
            <View style={styles.methodButtons}>
              <TouchableOpacity
                style={[styles.methodButton, inputMethod === 'current' && styles.methodButtonActive]}
                onPress={() => {
                  setInputMethod('current');
                  setSelectedMapLocation(null);
                }}
              >
                <Ionicons name="locate" size={20} color={inputMethod === 'current' ? '#fff' : '#6366f1'} />
                <Text style={[styles.methodButtonText, inputMethod === 'current' && styles.methodButtonTextActive]}>
                  Current GPS
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.methodButton, inputMethod === 'map' && styles.methodButtonActive]}
                onPress={() => setShowMapPicker(true)}
              >
                <Ionicons name="map" size={20} color={inputMethod === 'map' ? '#fff' : '#6366f1'} />
                <Text style={[styles.methodButtonText, inputMethod === 'map' && styles.methodButtonTextActive]}>
                  Pick on Map
                </Text>
              </TouchableOpacity>
            </View>

            {selectedMapLocation && (
              <View style={styles.selectedLocationInfo}>
                <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                <Text style={styles.selectedLocationText}>
                  {selectedMapLocation.latitude.toFixed(6)}, {selectedMapLocation.longitude.toFixed(6)}
                </Text>
              </View>
            )}

            <Text style={styles.modalLabel}>Radius (meters)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="100"
              placeholderTextColor="#64748b"
              value={customRadius}
              onChangeText={setCustomRadius}
              keyboardType="number-pad"
            />
            <Text style={styles.modalHint}>
              Smaller radius = more precise, but may miss triggers. Default: 100m
            </Text>

            <TouchableOpacity
              style={[
                styles.modalSaveButton,
                (!customLocationName.trim() || (inputMethod === 'map' && !selectedMapLocation)) && styles.modalSaveButtonDisabled
              ]}
              onPress={() => handleSaveLocation(customLocationName, parseInt(customRadius) || 100)}
              disabled={!customLocationName.trim() || (inputMethod === 'map' && !selectedMapLocation)}
            >
              <Ionicons name="location" size={20} color="#fff" />
              <Text style={styles.modalSaveButtonText}>
                {inputMethod === 'current' ? 'Save Current Location' : 'Save Selected Location'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Map Picker */}
      <LocationPicker
        visible={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onSelectLocation={handleMapLocationSelected}
        initialLocation={selectedMapLocation || undefined}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 16,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#1e293b',
    borderRadius: 12,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationIconSaved: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  locationDetails: {
    flex: 1,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  locationCoords: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: 'monospace',
  },
  locationStatus: {
    fontSize: 13,
    color: '#10b981',
    marginTop: 2,
  },
  locationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionButton: {
    padding: 8,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  suggestionText: {
    fontSize: 14,
    color: '#e2e8f0',
  },
  instructionList: {
    gap: 12,
  },
  instruction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  instructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionNumberText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: '#e2e8f0',
    lineHeight: 20,
  },
  appInfo: {
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  appInfoText: {
    fontSize: 14,
    color: '#64748b',
  },
  appInfoSubtext: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  modalLabel: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  methodButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  methodButtonActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  methodButtonText: {
    color: '#6366f1',
    fontWeight: '500',
    fontSize: 14,
  },
  methodButtonTextActive: {
    color: '#fff',
  },
  selectedLocationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  selectedLocationText: {
    color: '#10b981',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  modalHint: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 20,
    marginTop: -8,
  },
  modalSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366f1',
    borderRadius: 10,
    padding: 16,
  },
  modalSaveButtonDisabled: {
    backgroundColor: '#334155',
  },
  modalSaveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
