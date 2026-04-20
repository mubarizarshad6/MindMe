import Groq from 'groq-sdk';

const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;

if (!apiKey) {
  throw new Error('EXPO_PUBLIC_GROQ_API_KEY is not set. Copy .env.example to .env and fill it in.');
}

const groq = new Groq({
  apiKey,
  dangerouslyAllowBrowser: true,
});

// Schedule types for notifications
export type ScheduleType = 'once' | 'daily' | 'weekly' | 'manual';

// Types for our reminder system
export interface ParsedReminder {
  id: string;
  items: string[];           // What to remember: ["tiffin", "keys", "helmet"]
  trigger: 'time' | 'location' | 'manual';  // When to remind
  triggerValue?: string;     // "8:30 AM" or "leaving home"
  category: 'office' | 'home' | 'errand' | 'family' | 'other';
  originalText: string;      // The original user input
  createdAt: string;
  // New notification fields
  scheduleType: ScheduleType;  // once, daily, weekly, manual
  scheduledTime?: string;      // ISO string for when to notify
  relativeTime?: number;       // seconds from now (for "in 30 seconds")
  weekDays?: number[];         // For weekly: [0,1,2,3,4,5,6] (Sun-Sat)
  notificationId?: string;     // To cancel/update notification
  isRecurring?: boolean;       // For location reminders: trigger every time (not just once)
}

export interface AIResponse {
  message: string;           // AI's friendly response
  reminder?: ParsedReminder; // Parsed reminder if detected (first/single)
  reminders?: ParsedReminder[]; // Multiple reminders when user gives a list
  isReminder: boolean;       // Whether this was a reminder request
}

// System prompt that tells AI how to behave
const SYSTEM_PROMPT = `You are a helpful life assistant that helps users remember things.

When a user tells you something to remember, extract:
1. ITEMS: What they need to remember (list of things)
2. TRIGGER: "time" for specific times, "location" for places, "manual" if no time specified
3. CATEGORY: office, home, errand, family, or other
4. SCHEDULE_TYPE:
   - "once" for one-time reminders (e.g., "in 30 seconds", "at 3 PM", "tomorrow at 9 AM")
   - "daily" for daily reminders (e.g., "every day at 8 AM", "daily reminder")
   - "weekly" for weekly reminders (e.g., "every Monday", "on weekends")
   - "manual" if no specific time
5. RELATIVE_SECONDS: If user says "in X seconds/minutes/hours", calculate total seconds (e.g., "in 30 seconds" = 30, "in 2 minutes" = 120, "in 1 hour" = 3600)
6. SCHEDULED_TIME: For specific times, provide in 24-hour format "HH:MM" (e.g., "14:30" for 2:30 PM)
7. WEEK_DAYS: For weekly reminders, array of day numbers [0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat]

IMPORTANT FOR LOCATION REMINDERS:
- Extract the EXACT location name the user mentions (e.g., "Mom's House", "Grocery Store", "Coffee Shop", "Gym", "Office", etc.)
- The user can have ANY custom location saved, not just standard ones
- Put the action (leaving/arriving) + location name in triggerValue (e.g., "leaving Mom's House", "arriving at Grocery Store")
- IS_RECURRING: Set to true if user says "every time", "always", "whenever", or implies repeated triggers. Set to false for one-time location reminders.

ALWAYS respond in this JSON format ONLY (no extra text):

For a SINGLE reminder:
{
  "message": "Your friendly response to the user",
  "isReminder": true,
  "reminder": {
    "items": ["item1", "item2"],
    "trigger": "time",
    "triggerValue": "in 30 seconds",
    "category": "office",
    "scheduleType": "once",
    "relativeSeconds": 30,
    "scheduledTime": null,
    "weekDays": null,
    "isRecurring": false
  }
}

For MULTIPLE separate reminders (different times, locations, or contexts):
{
  "message": "Your friendly response to the user",
  "isReminder": true,
  "reminders": [
    {
      "items": ["call mom"],
      "trigger": "time",
      "triggerValue": "3:00 PM",
      "category": "family",
      "scheduleType": "once",
      "relativeSeconds": null,
      "scheduledTime": "15:00",
      "weekDays": null,
      "isRecurring": false
    },
    {
      "items": ["buy groceries"],
      "trigger": "time",
      "triggerValue": "5:00 PM",
      "category": "errand",
      "scheduleType": "once",
      "relativeSeconds": null,
      "scheduledTime": "17:00",
      "weekDays": null,
      "isRecurring": false
    }
  ]
}

IMPORTANT: When the user gives you a LIST of things to remember with DIFFERENT times or triggers, use the "reminders" array format to create SEPARATE reminders for each one. When items share the same trigger (e.g., "remind me to take tiffin, keys, and helmet when leaving"), use a single "reminder" with multiple items in the items array.

If it's NOT a reminder request, respond with:
{
  "message": "Your friendly response",
  "isReminder": false
}

Examples:
User: "Remind me in 30 seconds to bring coffee"
{"message": "Got it! I'll remind you in 30 seconds to bring coffee.", "isReminder": true, "reminder": {"items": ["bring coffee"], "trigger": "time", "triggerValue": "in 30 seconds", "category": "other", "scheduleType": "once", "relativeSeconds": 30, "scheduledTime": null, "weekDays": null}}

User: "Remind me every day at 8 AM to take medicine"
{"message": "Done! I'll remind you daily at 8 AM to take your medicine.", "isReminder": true, "reminder": {"items": ["take medicine"], "trigger": "time", "triggerValue": "8:00 AM daily", "category": "home", "scheduleType": "daily", "relativeSeconds": null, "scheduledTime": "08:00", "weekDays": null}}

User: "Remind me every Monday to submit report"
{"message": "Got it! I'll remind you every Monday to submit your report.", "isReminder": true, "reminder": {"items": ["submit report"], "trigger": "time", "triggerValue": "every Monday", "category": "office", "scheduleType": "weekly", "relativeSeconds": null, "scheduledTime": "09:00", "weekDays": [1]}}

User: "Remind me to take my tiffin when I leave for office"
{"message": "Got it! I'll remind you about your tiffin when you leave for office.", "isReminder": true, "reminder": {"items": ["tiffin"], "trigger": "location", "triggerValue": "leaving office", "category": "office", "scheduleType": "manual", "relativeSeconds": null, "scheduledTime": null, "weekDays": null, "isRecurring": false}}

User: "Remind me to buy groceries when I reach the market"
{"message": "Got it! I'll remind you to buy groceries when you reach the market.", "isReminder": true, "reminder": {"items": ["buy groceries"], "trigger": "location", "triggerValue": "arriving market", "category": "errand", "scheduleType": "manual", "relativeSeconds": null, "scheduledTime": null, "weekDays": null, "isRecurring": false}}

User: "Remind me to pick up the cake when I get to Mom's House"
{"message": "Got it! I'll remind you to pick up the cake when you get to Mom's House.", "isReminder": true, "reminder": {"items": ["pick up the cake"], "trigger": "location", "triggerValue": "arriving Mom's House", "category": "family", "scheduleType": "manual", "relativeSeconds": null, "scheduledTime": null, "weekDays": null, "isRecurring": false}}

User: "Every time I leave home, remind me to take my keys"
{"message": "Got it! I'll always remind you to take your keys whenever you leave home.", "isReminder": true, "reminder": {"items": ["take keys"], "trigger": "location", "triggerValue": "leaving home", "category": "home", "scheduleType": "manual", "relativeSeconds": null, "scheduledTime": null, "weekDays": null, "isRecurring": true}}

User: "Always remind me to check my bag when I arrive at office"
{"message": "Sure! I'll remind you every time you arrive at the office to check your bag.", "isReminder": true, "reminder": {"items": ["check bag"], "trigger": "location", "triggerValue": "arriving office", "category": "office", "scheduleType": "manual", "relativeSeconds": null, "scheduledTime": null, "weekDays": null, "isRecurring": true}}

User: "Remind me at 3 PM to call mom"
{"message": "Sure! I'll remind you at 3 PM to call mom.", "isReminder": true, "reminder": {"items": ["call mom"], "trigger": "time", "triggerValue": "3:00 PM", "category": "family", "scheduleType": "once", "relativeSeconds": null, "scheduledTime": "15:00", "weekDays": null}}

User: "Remind me in 5 minutes to check email"
{"message": "Got it! I'll remind you in 5 minutes to check email.", "isReminder": true, "reminder": {"items": ["check email"], "trigger": "time", "triggerValue": "in 5 minutes", "category": "office", "scheduleType": "once", "relativeSeconds": 300, "scheduledTime": null, "weekDays": null}}

User: "Remind me to call mom at 3 PM, buy groceries at 5 PM, and take medicine at 9 PM"
{"message": "Got it! I've set up 3 reminders for you.", "isReminder": true, "reminders": [{"items": ["call mom"], "trigger": "time", "triggerValue": "3:00 PM", "category": "family", "scheduleType": "once", "relativeSeconds": null, "scheduledTime": "15:00", "weekDays": null}, {"items": ["buy groceries"], "trigger": "time", "triggerValue": "5:00 PM", "category": "errand", "scheduleType": "once", "relativeSeconds": null, "scheduledTime": "17:00", "weekDays": null}, {"items": ["take medicine"], "trigger": "time", "triggerValue": "9:00 PM", "category": "home", "scheduleType": "once", "relativeSeconds": null, "scheduledTime": "21:00", "weekDays": null}]}

Be friendly and keep responses short. You have access to the conversation history - use it to maintain context and give relevant follow-up responses. ONLY output valid JSON, nothing else.`;

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

// Main function to chat with AI
export async function chatWithAI(
  userMessage: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<AIResponse> {
  try {
    // Build messages array with conversation history for context
    const historyMessages = conversationHistory.slice(-20).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...historyMessages,
        { role: 'user', content: userMessage },
      ],
      model: 'llama-3.3-70b-versatile', // Fast and capable
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content || '';
    console.log('Groq response:', response);

    // Try to parse as JSON
    try {
      // Extract JSON from response (sometimes AI adds extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Helper to process a single reminder object
        const processReminder = (rem: any): ParsedReminder => {
          const now = new Date();
          let scheduledTime: string | undefined;

          if (rem.relativeSeconds) {
            const notifyAt = new Date(now.getTime() + rem.relativeSeconds * 1000);
            scheduledTime = notifyAt.toISOString();
          } else if (rem.scheduledTime) {
            const [hours, minutes] = rem.scheduledTime.split(':').map(Number);
            const notifyAt = new Date(now);
            notifyAt.setHours(hours, minutes, 0, 0);
            if (notifyAt <= now && rem.scheduleType === 'once') {
              notifyAt.setDate(notifyAt.getDate() + 1);
            }
            scheduledTime = notifyAt.toISOString();
          }

          return {
            ...rem,
            id: generateId(),
            originalText: userMessage,
            createdAt: now.toISOString(),
            scheduledTime,
            scheduleType: rem.scheduleType || 'manual',
            relativeTime: rem.relativeSeconds,
          };
        };

        // Handle multiple reminders (list format)
        if (parsed.isReminder && parsed.reminders && Array.isArray(parsed.reminders)) {
          parsed.reminders = parsed.reminders.map(processReminder);
          // Also set the first one as `reminder` for backward compatibility
          parsed.reminder = parsed.reminders[0];
        }
        // Handle single reminder
        else if (parsed.isReminder && parsed.reminder) {
          parsed.reminder = processReminder(parsed.reminder);
        }

        return parsed as AIResponse;
      }
    } catch (parseError) {
      console.log('JSON parse error, using plain text');
    }

    // Fallback: return plain text response
    return {
      message: response,
      isReminder: false,
    };

  } catch (error) {
    console.error('Groq API Error:', error);
    return {
      message: "Sorry, I'm having trouble connecting. Please try again!",
      isReminder: false,
    };
  }
}

// Test function to verify API is working
export async function testGroqConnection(): Promise<boolean> {
  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'Say "Connected!" in one word' }],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 10,
    });
    return completion.choices[0]?.message?.content?.toLowerCase().includes('connected') || false;
  } catch (error) {
    console.error('Groq connection test failed:', error);
    return false;
  }
}
