// ===========================================
// LOCATION PICKER COMPONENT
// ===========================================
// Map-based location picker with search and manual input

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  FlatList,
  Keyboard,
  Dimensions,
  Platform,
} from 'react-native';
import MapView, { Marker, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

// Types
export interface SelectedLocation {
  latitude: number;
  longitude: number;
  address?: string;
}

interface LocationPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectLocation: (location: SelectedLocation) => void;
  initialLocation?: SelectedLocation;
}

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

// Default location (will be overridden by user's current location)
const DEFAULT_REGION: Region = {
  latitude: 28.6139,  // Delhi
  longitude: 77.2090,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

export default function LocationPicker({
  visible,
  onClose,
  onSelectLocation,
  initialLocation,
}: LocationPickerProps) {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [selectedCoords, setSelectedCoords] = useState<SelectedLocation | null>(
    initialLocation || null
  );
  const [inputMode, setInputMode] = useState<'map' | 'search' | 'manual'>('map');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Manual input state
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

  // Loading state
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  // Get current location on mount
  useEffect(() => {
    if (visible && !initialLocation) {
      getCurrentLocation();
    } else if (initialLocation) {
      setRegion({
        ...DEFAULT_REGION,
        latitude: initialLocation.latitude,
        longitude: initialLocation.longitude,
      });
      setSelectedCoords(initialLocation);
      setManualLat(initialLocation.latitude.toString());
      setManualLng(initialLocation.longitude.toString());
    }
  }, [visible, initialLocation]);

  // Get user's current location
  const getCurrentLocation = async () => {
    setIsLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        setIsLoadingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const newRegion: Region = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

      setRegion(newRegion);
      setSelectedCoords({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      setManualLat(location.coords.latitude.toString());
      setManualLng(location.coords.longitude.toString());

      mapRef.current?.animateToRegion(newRegion, 500);
    } catch (error) {
      console.error('Error getting location:', error);
    } finally {
      setIsLoadingLocation(false);
    }
  };

  // Handle map press to select location
  const handleMapPress = (event: any) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setSelectedCoords({ latitude, longitude });
    setManualLat(latitude.toFixed(6));
    setManualLng(longitude.toFixed(6));
  };

  // Search for address using OpenStreetMap Nominatim
  const searchAddress = async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&limit=5`,
        {
          headers: {
            'User-Agent': 'AILifeAssistant/1.0',
          },
        }
      );
      const data: SearchResult[] = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle search result selection
  const handleSelectSearchResult = (result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    setSelectedCoords({
      latitude: lat,
      longitude: lng,
      address: result.display_name,
    });
    setManualLat(lat.toFixed(6));
    setManualLng(lng.toFixed(6));

    const newRegion: Region = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
    setRegion(newRegion);
    mapRef.current?.animateToRegion(newRegion, 500);

    setSearchQuery(result.display_name.split(',')[0]);
    setSearchResults([]);
    setInputMode('map');
    Keyboard.dismiss();
  };

  // Handle manual coordinate input
  const handleManualSubmit = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (isNaN(lat) || isNaN(lng)) {
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return;
    }

    setSelectedCoords({ latitude: lat, longitude: lng });

    const newRegion: Region = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
    setRegion(newRegion);
    mapRef.current?.animateToRegion(newRegion, 500);
    setInputMode('map');
    Keyboard.dismiss();
  };

  // Confirm selection
  const handleConfirm = () => {
    if (selectedCoords) {
      onSelectLocation(selectedCoords);
      onClose();
    }
  };

  // Reset state on close
  const handleClose = () => {
    setSearchQuery('');
    setSearchResults([]);
    setInputMode('map');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Select Location</Text>
          <TouchableOpacity
            onPress={handleConfirm}
            style={[styles.confirmButton, !selectedCoords && styles.confirmButtonDisabled]}
            disabled={!selectedCoords}
          >
            <Text style={styles.confirmButtonText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Input Mode Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, inputMode === 'map' && styles.tabActive]}
            onPress={() => setInputMode('map')}
          >
            <Ionicons name="map" size={18} color={inputMode === 'map' ? '#fff' : '#94a3b8'} />
            <Text style={[styles.tabText, inputMode === 'map' && styles.tabTextActive]}>Map</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, inputMode === 'search' && styles.tabActive]}
            onPress={() => setInputMode('search')}
          >
            <Ionicons name="search" size={18} color={inputMode === 'search' ? '#fff' : '#94a3b8'} />
            <Text style={[styles.tabText, inputMode === 'search' && styles.tabTextActive]}>Search</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, inputMode === 'manual' && styles.tabActive]}
            onPress={() => setInputMode('manual')}
          >
            <Ionicons name="keypad" size={18} color={inputMode === 'manual' ? '#fff' : '#94a3b8'} />
            <Text style={[styles.tabText, inputMode === 'manual' && styles.tabTextActive]}>Coordinates</Text>
          </TouchableOpacity>
        </View>

        {/* Search Input */}
        {inputMode === 'search' && (
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={20} color="#64748b" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for an address..."
                placeholderTextColor="#64748b"
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  searchAddress(text);
                }}
                autoFocus
              />
              {isSearching && <ActivityIndicator size="small" color="#6366f1" />}
            </View>

            {searchResults.length > 0 && (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.place_id.toString()}
                style={styles.searchResults}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.searchResultItem}
                    onPress={() => handleSelectSearchResult(item)}
                  >
                    <Ionicons name="location" size={18} color="#6366f1" />
                    <Text style={styles.searchResultText} numberOfLines={2}>
                      {item.display_name}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}

        {/* Manual Input */}
        {inputMode === 'manual' && (
          <View style={styles.manualContainer}>
            <View style={styles.manualInputRow}>
              <View style={styles.manualInputGroup}>
                <Text style={styles.manualLabel}>Latitude</Text>
                <TextInput
                  style={styles.manualInput}
                  placeholder="-90 to 90"
                  placeholderTextColor="#64748b"
                  value={manualLat}
                  onChangeText={setManualLat}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.manualInputGroup}>
                <Text style={styles.manualLabel}>Longitude</Text>
                <TextInput
                  style={styles.manualInput}
                  placeholder="-180 to 180"
                  placeholderTextColor="#64748b"
                  value={manualLng}
                  onChangeText={setManualLng}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <TouchableOpacity style={styles.manualButton} onPress={handleManualSubmit}>
              <Text style={styles.manualButtonText}>Go to Location</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Map */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            region={region}
            onRegionChangeComplete={setRegion}
            onPress={handleMapPress}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {selectedCoords && (
              <Marker
                coordinate={{
                  latitude: selectedCoords.latitude,
                  longitude: selectedCoords.longitude,
                }}
                pinColor="#6366f1"
              />
            )}
          </MapView>

          {/* Current Location Button */}
          <TouchableOpacity
            style={styles.currentLocationButton}
            onPress={getCurrentLocation}
            disabled={isLoadingLocation}
          >
            {isLoadingLocation ? (
              <ActivityIndicator size="small" color="#6366f1" />
            ) : (
              <Ionicons name="locate" size={24} color="#6366f1" />
            )}
          </TouchableOpacity>

          {/* Center Crosshair (alternative to tapping) */}
          <View style={styles.crosshairContainer} pointerEvents="none">
            <Ionicons name="add" size={32} color="rgba(99, 102, 241, 0.5)" />
          </View>
        </View>

        {/* Selected Location Info */}
        {selectedCoords && (
          <View style={styles.selectedInfo}>
            <Ionicons name="location" size={20} color="#10b981" />
            <Text style={styles.selectedText}>
              {selectedCoords.latitude.toFixed(6)}, {selectedCoords.longitude.toFixed(6)}
            </Text>
          </View>
        )}

        {/* Instructions */}
        <Text style={styles.instructions}>
          Tap on the map to select a location, or use search/coordinates
        </Text>
      </View>
    </Modal>
  );
}

const { height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#1e293b',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  confirmButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  confirmButtonDisabled: {
    backgroundColor: '#334155',
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0f172a',
  },
  tabActive: {
    backgroundColor: '#6366f1',
  },
  tabText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#fff',
  },
  searchContainer: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 12,
  },
  searchResults: {
    maxHeight: 200,
    marginTop: 8,
    backgroundColor: '#0f172a',
    borderRadius: 10,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  searchResultText: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 14,
  },
  manualContainer: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  manualInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  manualInputGroup: {
    flex: 1,
  },
  manualLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 6,
  },
  manualInput: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  manualButton: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  manualButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  currentLocationButton: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  crosshairContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -16,
    marginLeft: -16,
  },
  selectedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
  },
  selectedText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  instructions: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 12,
    paddingVertical: 8,
    backgroundColor: '#0f172a',
  },
});
