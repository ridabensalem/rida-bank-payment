// Simple in-memory database to simulate persistence
const users = {
  "cus_12345": {
    email: "user@example.com",
    available_balance_cents: 10000,
  }
};

const processedEvents = new Set();

export const db = {
  getUser: (id) => users[id],
  updateBalance: (id, amount) => {
    if (!users[id]) throw new Error("User not found");
    users[id].available_balance_cents += amount;
    return users[id];
  },
  isEventProcessed: (eventId) => processedEvents.has(eventId),
  markEventProcessed: (eventId) => processedEvents.add(eventId),
};
