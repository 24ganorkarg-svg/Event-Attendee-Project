import { createApp } from './app.js';

function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const { db, close } = createApp({ ...(process.env.DB_PATH ? { databasePath: process.env.DB_PATH } : {}) });
try {
  if (db.prepare('SELECT value FROM app_metadata WHERE key = ?').get('demo_seed_v1')) {
    console.log('Demo data has already been added. Existing records were left unchanged.');
  } else {
    db.exec('BEGIN IMMEDIATE');
    try {
      const events = [
        ['Design Forward 2026', futureDate(7), '10:00', 'The Assembly Hall, Pune', 120, 'Conference', 'Demo event: A day of fresh ideas, thoughtful conversations, and people shaping the future of design.'],
        ['Build with JavaScript', futureDate(12), '14:00', 'Innovation Studio, Mumbai', 35, 'Workshop', 'Demo event: A hands-on workshop for curious builders. Bring a laptop and leave with something you made.'],
        ['Founders & Friends', futureDate(18), '18:30', 'The Greenhouse, Bengaluru', 60, 'Networking', 'Demo event: Meet local founders, exchange ideas, and make new connections over coffee.'],
        ['Community Coffee', futureDate(24), '09:30', 'Common Ground Café, Pune', 25, 'Meetup', 'Demo event: A relaxed morning for our creative community to connect and share what they are working on.'],
      ];
      const insertEvent = db.prepare('INSERT INTO events (name, date, time, venue, capacity, category, description) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const eventIds = events.map((event) => Number(insertEvent.run(...event).lastInsertRowid));
      const people = [
        [0, 'Aarav Sharma', 'aarav@example.com', 'VIP'], [0, 'Priya Desai', 'priya@example.com', 'General'],
        [0, 'Rohan Mehta', 'rohan@example.com', 'Student'], [0, 'Ananya Iyer', 'ananya@example.com', 'General'],
        [1, 'Kabir Shah', 'kabir@example.com', 'Student'], [1, 'Meera Nair', 'meera@example.com', 'General'],
        [2, 'Ishaan Kapoor', 'ishaan@example.com', 'VIP'], [2, 'Diya Patel', 'diya@example.com', 'General'],
        [3, 'Neel Joshi', 'neel@example.com', 'General'], [3, 'Tara Rao', 'tara@example.com', 'Student'],
      ];
      const insertAttendee = db.prepare('INSERT INTO attendees (event_id, name, email, ticket_type) VALUES (?, ?, ?, ?)');
      for (const [index, name, email, ticket] of people) insertAttendee.run(eventIds[index], name, email, ticket);
      db.prepare('INSERT INTO app_metadata (key, value) VALUES (?, ?)').run('demo_seed_v1', new Date().toISOString());
      db.exec('COMMIT');
      console.log('Added 4 demo events and 10 demo attendees. Existing records were left unchanged.');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
} finally { close(); }
