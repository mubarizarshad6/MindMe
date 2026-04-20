// ===========================================
// REMINDERS SCREEN - View all your reminders
// ===========================================
// Now with manual reminder creation!

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useReminders } from '../../context/ReminderContext';
import { ParsedReminder, ScheduleType } from '../../services/groq';
import { getSavedLocations, SavedLocation } from '../../services/location';

type FilterType = 'all' | 'office' | 'home' | 'family' | 'errand';
type TriggerType = 'time' | 'location' | 'manual';
type CategoryType = 'office' | 'home' | 'errand' | 'family' | 'other';

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const { reminders, deleteReminder, completeReminder, addReminder, updateReminder } = useReminders();
  const [filter, setFilter] = useState<FilterType>('all');

  // Manual reminder form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [reminderText, setReminderText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('other');
  const [selectedTrigger, setSelectedTrigger] = useState<TriggerType>('manual');
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [selectedLocation, setSelectedLocation] = useState<SavedLocation | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);

  // Edit mode state
  const [editingReminder, setEditingReminder] = useState<ParsedReminder | null>(null);

  // Load saved locations when modal opens
  const openAddModal = async () => {
    const locations = await getSavedLocations();
    setSavedLocations(locations);
    if (locations.length > 0 && !selectedLocation) {
      setSelectedLocation(locations[0]);
    }
    setEditingReminder(null); // New reminder mode
    setShowAddModal(true);
  };

  // Open modal in edit mode
  const openEditModal = async (reminder: ParsedReminder) => {
    const locations = await getSavedLocations();
    setSavedLocations(locations);

    // Populate form with existing reminder data
    setReminderText(reminder.items.join(', '));
    setSelectedCategory(reminder.category);
    setSelectedTrigger(reminder.trigger);
    setIsRecurring(reminder.isRecurring ?? false);

    // Handle time-based reminder
    if (reminder.trigger === 'time' && reminder.scheduledTime) {
      const date = new Date(reminder.scheduledTime);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      setSelectedTime(`${hours}:${minutes}`);
    } else if (reminder.triggerValue && reminder.trigger === 'time') {
      // Try to extract time from triggerValue like "3:00 PM"
      setSelectedTime(reminder.triggerValue);
    }

    // Handle location-based reminder
    if (reminder.trigger === 'location' && reminder.triggerValue) {
      const locationName = reminder.triggerValue
        .replace(/leaving|arriving|at/gi, '')
        .trim();
      const matchingLocation = locations.find(
        (l) => l.name.toLowerCase() === locationName.toLowerCase()
      );
      setSelectedLocation(matchingLocation || null);
    }

    setEditingReminder(reminder);
    setShowAddModal(true);
  };

  // Reset form
  const resetForm = () => {
    setReminderText('');
    setSelectedCategory('other');
    setSelectedTrigger('manual');
    setSelectedTime('09:00');
    setSelectedLocation(null);
    setIsRecurring(false);
    setEditingReminder(null);
  };

  // Create or update reminder
  const handleSaveReminder = () => {
    if (!reminderText.trim()) {
      Alert.alert('Error', 'Please enter what to remind you about');
      return;
    }

    // Build trigger value
    let triggerValue: string | undefined;
    if (selectedTrigger === 'time') {
      triggerValue = selectedTime;
    } else if (selectedTrigger === 'location' && selectedLocation) {
      triggerValue = `arriving ${selectedLocation.name}`;
    }

    // Calculate scheduled time for time-based reminders
    let scheduledTime: string | undefined;
    if (selectedTrigger === 'time' && selectedTime) {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const notifyAt = new Date();
      notifyAt.setHours(hours, minutes, 0, 0);
      // If time has passed today, schedule for tomorrow
      if (notifyAt <= new Date()) {
        notifyAt.setDate(notifyAt.getDate() + 1);
      }
      scheduledTime = notifyAt.toISOString();
    }

    if (editingReminder) {
      // Update existing reminder
      updateReminder(editingReminder.id, {
        items: [reminderText.trim()],
        trigger: selectedTrigger,
        triggerValue,
        category: selectedCategory,
        scheduleType: selectedTrigger === 'time' ? 'once' : 'manual',
        scheduledTime,
        isRecurring: selectedTrigger === 'location' ? isRecurring : undefined,
      });
      Alert.alert('Success', 'Reminder updated!');
    } else {
      // Create new reminder
      const reminder: ParsedReminder = {
        id: generateId(),
        items: [reminderText.trim()],
        trigger: selectedTrigger,
        triggerValue,
        category: selectedCategory,
        originalText: `Manual: ${reminderText.trim()}`,
        createdAt: new Date().toISOString(),
        scheduleType: selectedTrigger === 'time' ? 'once' : 'manual',
        scheduledTime,
        isRecurring: selectedTrigger === 'location' ? isRecurring : undefined,
      };
      addReminder(reminder);
      Alert.alert('Success', 'Reminder created!');
    }

    setShowAddModal(false);
    resetForm();
  };

  // Filter reminders
  const filteredReminders = filter === 'all'
    ? reminders
    : reminders.filter((r) => r.category === filter);

  // Get category icon
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'office':
        return 'briefcase';
      case 'home':
        return 'home';
      case 'family':
        return 'heart';
      case 'errand':
        return 'cart';
      default:
        return 'list';
    }
  };

  // Get category color
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'office':
        return '#6366f1';
      case 'home':
        return '#10b981';
      case 'family':
        return '#f43f5e';
      case 'errand':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  // Handle complete
  const handleComplete = (item: ParsedReminder) => {
    Alert.alert(
      'Complete Reminder',
      `Mark "${item.items.join(', ')}" as done?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: () => completeReminder(item.id),
        },
      ]
    );
  };

  // Handle delete
  const handleDelete = (item: ParsedReminder) => {
    Alert.alert(
      'Delete Reminder',
      `Delete "${item.items.join(', ')}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteReminder(item.id),
        },
      ]
    );
  };

  // Render reminder card
  const renderReminder = ({ item }: { item: ParsedReminder }) => {
    const categoryColor = getCategoryColor(item.category);
    const categoryIcon = getCategoryIcon(item.category);

    return (
      <View style={[styles.card, { borderLeftColor: categoryColor }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '20' }]}>
            <Ionicons name={categoryIcon as any} size={14} color={categoryColor} />
            <Text style={[styles.categoryText, { color: categoryColor }]}>
              {item.category}
            </Text>
          </View>
          {item.triggerValue && (
            <View style={styles.triggerBadge}>
              <Ionicons name="time-outline" size={12} color="#94a3b8" />
              <Text style={styles.triggerText}>{item.triggerValue}</Text>
            </View>
          )}
        </View>

        <View style={styles.itemsList}>
          {item.items.map((reminderItem, index) => (
            <View key={index} style={styles.itemRow}>
              <View style={styles.bullet} />
              <Text style={styles.itemText}>{reminderItem}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.originalText} numberOfLines={1}>
          "{item.originalText}"
        </Text>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.completeButton]}
            onPress={() => handleComplete(item)}
          >
            <Ionicons name="checkmark" size={18} color="#10b981" />
            <Text style={styles.completeText}>Done</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.editButton]}
            onPress={() => openEditModal(item)}
          >
            <Ionicons name="pencil" size={18} color="#6366f1" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Filter buttons
  const filters: { key: FilterType; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: 'list' },
    { key: 'office', label: 'Office', icon: 'briefcase' },
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'family', label: 'Family', icon: 'heart' },
    { key: 'errand', label: 'Errands', icon: 'cart' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="notifications" size={28} color="#6366f1" />
        <Text style={styles.headerTitle}>My Reminders</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{reminders.length}</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          data={filters}
          keyExtractor={(item) => item.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterButton,
                filter === item.key && styles.filterButtonActive,
              ]}
              onPress={() => setFilter(item.key)}
            >
              <Ionicons
                name={item.icon as any}
                size={16}
                color={filter === item.key ? '#fff' : '#94a3b8'}
              />
              <Text
                style={[
                  styles.filterText,
                  filter === item.key && styles.filterTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Reminders List */}
      {filteredReminders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-off-outline" size={64} color="#334155" />
          <Text style={styles.emptyTitle}>No reminders yet</Text>
          <Text style={styles.emptyText}>
            Tap the + button to add a reminder manually, or use the Assistant tab to speak naturally!
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredReminders}
          keyExtractor={(item) => item.id}
          renderItem={renderReminder}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 90 }]}
        onPress={openAddModal}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Manual Reminder Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingReminder ? 'Edit Reminder' : 'Add Reminder'}
              </Text>
              <TouchableOpacity onPress={() => { setShowAddModal(false); resetForm(); }}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Reminder Text Input */}
              <Text style={styles.inputLabel}>What do you want to remember?</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Take medicine, Buy groceries..."
                placeholderTextColor="#64748b"
                value={reminderText}
                onChangeText={setReminderText}
                multiline
                maxLength={200}
              />

              {/* Category Selection */}
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.optionGrid}>
                {(['office', 'home', 'family', 'errand', 'other'] as CategoryType[]).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.optionButton,
                      selectedCategory === cat && styles.optionButtonActive,
                    ]}
                    onPress={() => setSelectedCategory(cat)}
                  >
                    <Ionicons
                      name={getCategoryIcon(cat) as any}
                      size={18}
                      color={selectedCategory === cat ? '#fff' : '#94a3b8'}
                    />
                    <Text
                      style={[
                        styles.optionText,
                        selectedCategory === cat && styles.optionTextActive,
                      ]}
                    >
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Trigger Type */}
              <Text style={styles.inputLabel}>When to remind?</Text>
              <View style={styles.triggerOptions}>
                <TouchableOpacity
                  style={[
                    styles.triggerButton,
                    selectedTrigger === 'manual' && styles.triggerButtonActive,
                  ]}
                  onPress={() => setSelectedTrigger('manual')}
                >
                  <Ionicons
                    name="hand-left"
                    size={20}
                    color={selectedTrigger === 'manual' ? '#fff' : '#94a3b8'}
                  />
                  <Text
                    style={[
                      styles.triggerLabel,
                      selectedTrigger === 'manual' && styles.triggerLabelActive,
                    ]}
                  >
                    Manual
                  </Text>
                  <Text style={styles.triggerSubtext}>No auto reminder</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.triggerButton,
                    selectedTrigger === 'time' && styles.triggerButtonActive,
                  ]}
                  onPress={() => setSelectedTrigger('time')}
                >
                  <Ionicons
                    name="time"
                    size={20}
                    color={selectedTrigger === 'time' ? '#fff' : '#94a3b8'}
                  />
                  <Text
                    style={[
                      styles.triggerLabel,
                      selectedTrigger === 'time' && styles.triggerLabelActive,
                    ]}
                  >
                    Time
                  </Text>
                  <Text style={styles.triggerSubtext}>At specific time</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.triggerButton,
                    selectedTrigger === 'location' && styles.triggerButtonActive,
                    savedLocations.length === 0 && styles.triggerButtonDisabled,
                  ]}
                  onPress={() => savedLocations.length > 0 && setSelectedTrigger('location')}
                  disabled={savedLocations.length === 0}
                >
                  <Ionicons
                    name="location"
                    size={20}
                    color={selectedTrigger === 'location' ? '#fff' : savedLocations.length === 0 ? '#4b5563' : '#94a3b8'}
                  />
                  <Text
                    style={[
                      styles.triggerLabel,
                      selectedTrigger === 'location' && styles.triggerLabelActive,
                      savedLocations.length === 0 && styles.triggerLabelDisabled,
                    ]}
                  >
                    Location
                  </Text>
                  <Text style={styles.triggerSubtext}>
                    {savedLocations.length === 0 ? 'No locations saved' : 'When arriving'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Time Picker (if time trigger) */}
              {selectedTrigger === 'time' && (
                <View style={styles.timePickerContainer}>
                  <Text style={styles.inputLabel}>Select Time</Text>
                  <View style={styles.timeInputRow}>
                    <TextInput
                      style={styles.timeInput}
                      placeholder="HH:MM"
                      placeholderTextColor="#64748b"
                      value={selectedTime}
                      onChangeText={setSelectedTime}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                    <Text style={styles.timeHint}>24-hour format (e.g., 14:30)</Text>
                  </View>
                </View>
              )}

              {/* Location Picker (if location trigger) */}
              {selectedTrigger === 'location' && savedLocations.length > 0 && (
                <View style={styles.locationPickerContainer}>
                  <Text style={styles.inputLabel}>Select Location</Text>
                  <View style={styles.locationList}>
                    {savedLocations.map((loc) => (
                      <TouchableOpacity
                        key={loc.id}
                        style={[
                          styles.locationItem,
                          selectedLocation?.id === loc.id && styles.locationItemActive,
                        ]}
                        onPress={() => setSelectedLocation(loc)}
                      >
                        <Ionicons
                          name="location"
                          size={18}
                          color={selectedLocation?.id === loc.id ? '#6366f1' : '#94a3b8'}
                        />
                        <Text
                          style={[
                            styles.locationName,
                            selectedLocation?.id === loc.id && styles.locationNameActive,
                          ]}
                        >
                          {loc.name}
                        </Text>
                        {selectedLocation?.id === loc.id && (
                          <Ionicons name="checkmark-circle" size={18} color="#6366f1" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Recurring toggle */}
                  <TouchableOpacity
                    style={styles.recurringToggle}
                    onPress={() => setIsRecurring(!isRecurring)}
                  >
                    <Ionicons
                      name={isRecurring ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={isRecurring ? '#6366f1' : '#94a3b8'}
                    />
                    <View style={styles.recurringTextContainer}>
                      <Text style={styles.recurringLabel}>Repeat every time</Text>
                      <Text style={styles.recurringHint}>
                        Remind me every time I arrive at this location
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.createButton, !reminderText.trim() && styles.createButtonDisabled]}
              onPress={handleSaveReminder}
              disabled={!reminderText.trim()}
            >
              <Ionicons name={editingReminder ? "checkmark-circle" : "add-circle"} size={22} color="#fff" />
              <Text style={styles.createButtonText}>
                {editingReminder ? 'Save Changes' : 'Create Reminder'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
  badge: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  filterContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  filterList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    gap: 6,
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: '#6366f1',
  },
  filterText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  triggerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  triggerText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  itemsList: {
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6366f1',
    marginRight: 10,
  },
  itemText: {
    fontSize: 16,
    color: '#e2e8f0',
  },
  originalText: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  completeButton: {
    backgroundColor: '#10b98120',
  },
  completeText: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '500',
  },
  editButton: {
    backgroundColor: '#6366f120',
  },
  deleteButton: {
    backgroundColor: '#ef444420',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#e2e8f0',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 22,
  },
  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalBody: {
    padding: 20,
    maxHeight: 500,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 10,
    marginTop: 16,
  },
  textInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  optionButtonActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  optionText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  optionTextActive: {
    color: '#fff',
    fontWeight: '500',
  },
  triggerOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  triggerButton: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 4,
  },
  triggerButtonActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  triggerButtonDisabled: {
    opacity: 0.5,
  },
  triggerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  triggerLabelActive: {
    color: '#fff',
  },
  triggerLabelDisabled: {
    color: '#4b5563',
  },
  triggerSubtext: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
  },
  timePickerContainer: {
    marginTop: 8,
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
    width: 100,
    textAlign: 'center',
  },
  timeHint: {
    fontSize: 12,
    color: '#64748b',
  },
  locationPickerContainer: {
    marginTop: 8,
  },
  locationList: {
    gap: 8,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  locationItemActive: {
    borderColor: '#6366f1',
    backgroundColor: '#6366f120',
  },
  locationName: {
    flex: 1,
    fontSize: 15,
    color: '#e2e8f0',
  },
  locationNameActive: {
    color: '#6366f1',
    fontWeight: '500',
  },
  recurringToggle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    gap: 12,
  },
  recurringTextContainer: {
    flex: 1,
  },
  recurringLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#e2e8f0',
  },
  recurringHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    marginHorizontal: 20,
    marginTop: 10,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  createButtonDisabled: {
    backgroundColor: '#4b5563',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
