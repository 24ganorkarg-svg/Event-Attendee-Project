import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const defaultDatabasePath = join(projectRoot, 'data', 'events.sqlite');
export const eventCategories = ['Conference', 'Workshop', 'Meetup', 'Networking', 'Other'];
export const ticketTypes = ['General', 'VIP', 'Student'];

class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

function positiveId(value, label = 'Record') {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new ApiError(400, `${label} ID must be a positive integer.`);
  }
  return Number(value);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function validateObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Send a JSON object with the required fields.');
  }
}

function validateEvent(body, existing) {
  validateObject(body);
  const values = { category: 'Other', description: '', ...existing, ...body };
  const fields = {};
  for (const [key, label, max] of [['name', 'Event name', 120], ['venue', 'Venue', 180]]) {
    if (typeof values[key] !== 'string' || !values[key].trim()) fields[key] = `${label} is required.`;
    else if (values[key].trim().length > max) fields[key] = `${label} must be ${max} characters or fewer.`;
  }
  if (!validDate(values.date)) fields.date = 'Enter a real date in YYYY-MM-DD format (1900–9999).';
  if (typeof values.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.time)) {
    fields.time = 'Enter a valid time in HH:mm format.';
  }
  if (typeof values.capacity !== 'number' || !Number.isSafeInteger(values.capacity) || values.capacity < 1 || values.capacity > 1000000) {
    fields.capacity = 'Capacity must be a whole number between 1 and 1,000,000.';
  }
  if (!eventCategories.includes(values.category)) fields.category = 'Choose a supported event category.';
  if (typeof values.description !== 'string' || values.description.length > 2000) fields.description = 'Description must be 2,000 characters or fewer.';
  if (Object.keys(fields).length) throw new ApiError(400, Object.values(fields)[0], fields);
  return {
    name: values.name.trim(), date: values.date, time: values.time, venue: values.venue.trim(),
    capacity: values.capacity, category: values.category, description: values.description.trim(),
  };
}

function validateAttendee(body, existing) {
  validateObject(body);
  const values = { ticketType: 'General', ...existing, ...body };
  const fields = {};
  if (!Number.isSafeInteger(values.eventId) || values.eventId < 1) fields.eventId = 'Choose a valid event.';
  if (typeof values.name !== 'string' || !values.name.trim()) fields.name = 'Attendee name is required.';
  else if (values.name.trim().length > 120) fields.name = 'Attendee name must be 120 characters or fewer.';
  if (typeof values.email !== 'string' || values.email.trim().length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(values.email.trim())) {
    fields.email = 'Enter a valid email address.';
  }
  if (!ticketTypes.includes(values.ticketType)) fields.ticketType = 'Choose General, VIP, or Student.';
  if (Object.keys(fields).length) throw new ApiError(400, Object.values(fields)[0], fields);
  return { eventId: values.eventId, name: values.name.trim(), email: values.email.trim().toLowerCase(), ticketType: values.ticketType };
}

function eventStatus(event) {
  if (new Date(`${event.date}T${event.time}:00`).getTime() < Date.now()) return 'past';
  return event.attendeeCount >= event.capacity ? 'full' : 'upcoming';
}

const eventSelect = `SELECT e.id, e.name, e.date, e.time, e.venue, e.capacity, e.category, e.description,
  COUNT(a.id) AS attendeeCount FROM events e LEFT JOIN attendees a ON a.event_id = e.id`;
const attendeeSelect = `SELECT a.id, a.event_id AS eventId, a.name, a.email, a.ticket_type AS ticketType,
  a.created_at AS createdAt, e.name AS eventName, e.date AS eventDate
  FROM attendees a JOIN events e ON e.id = a.event_id`;

export function createApp({ databasePath = defaultDatabasePath, demoMode = false } = {}) {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
      venue TEXT NOT NULL, capacity INTEGER NOT NULL CHECK (capacity > 0),
      category TEXT NOT NULL DEFAULT 'Other', description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE IF NOT EXISTS attendees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE,
      ticket_type TEXT NOT NULL DEFAULT 'General' CHECK (ticket_type IN ('General', 'VIP', 'Student')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(event_id, email)
    );
    CREATE INDEX IF NOT EXISTS attendees_event_id ON attendees(event_id);
    CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  function serializeEvent(event) {
    return { ...event, spotsRemaining: Math.max(0, event.capacity - event.attendeeCount), status: eventStatus(event) };
  }
  function getEvent(id) {
    const event = db.prepare(`${eventSelect} WHERE e.id = ? GROUP BY e.id`).get(id);
    if (!event) throw new ApiError(404, 'Event not found. It may have been deleted.');
    return serializeEvent(event);
  }
  function getAttendee(id) {
    const attendee = db.prepare(`${attendeeSelect} WHERE a.id = ?`).get(id);
    if (!attendee) throw new ApiError(404, 'Attendee not found. It may have been deleted.');
    return { ...attendee };
  }
  function transaction(operation) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function ensureRegistrationAllowed(values, currentId) {
    const event = getEvent(values.eventId);
    const duplicate = db.prepare('SELECT id FROM attendees WHERE event_id = ? AND email = ? COLLATE NOCASE AND id != ?').get(values.eventId, values.email, currentId ?? 0);
    if (duplicate) throw new ApiError(409, 'This email is already registered for this event.', { email: 'This attendee is already registered for this event.' });
    const current = currentId ? getAttendee(currentId) : null;
    if ((!current || current.eventId !== values.eventId) && event.attendeeCount >= event.capacity) {
      throw new ApiError(409, 'This event is full. Choose another event or increase its capacity.', { eventId: 'This event has no available spots.' });
    }
  }

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', demoMode }));
  app.get('/api/events', (req, res) => {
    const status = req.query.status ?? 'all';
    if (!['all', 'upcoming', 'past', 'full'].includes(status)) throw new ApiError(400, 'Choose all, upcoming, past, or full as the event status.');
    const search = String(req.query.search ?? '').trim();
    const events = db.prepare(`${eventSelect} WHERE instr(lower(e.name || ' ' || e.venue || ' ' || e.category), lower(?)) > 0
      GROUP BY e.id ORDER BY e.date ASC, e.time ASC, e.id ASC`).all(search).map(serializeEvent)
      .filter((event) => status === 'all' || (status === 'upcoming' ? event.status !== 'past' : event.status === status));
    res.json({ events });
  });
  app.get('/api/events/:id', (req, res) => res.json({ event: getEvent(positiveId(req.params.id, 'Event')) }));
  app.post('/api/events', (req, res) => {
    const values = validateEvent(req.body);
    const result = db.prepare('INSERT INTO events (name, date, time, venue, capacity, category, description) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(values.name, values.date, values.time, values.venue, values.capacity, values.category, values.description);
    res.status(201).json({ event: getEvent(Number(result.lastInsertRowid)) });
  });
  app.patch('/api/events/:id', (req, res) => {
    const id = positiveId(req.params.id, 'Event');
    const event = transaction(() => {
      const existing = getEvent(id);
      const values = validateEvent(req.body, existing);
      if (values.capacity < existing.attendeeCount) {
        throw new ApiError(409, `Capacity cannot be lower than the ${existing.attendeeCount} attendees already registered.`, { capacity: 'Remove attendees before reducing capacity below the current registration count.' });
      }
      db.prepare('UPDATE events SET name = ?, date = ?, time = ?, venue = ?, capacity = ?, category = ?, description = ? WHERE id = ?')
        .run(values.name, values.date, values.time, values.venue, values.capacity, values.category, values.description, id);
      return getEvent(id);
    });
    res.json({ event });
  });
  app.delete('/api/events/:id', (req, res) => {
    const id = positiveId(req.params.id, 'Event');
    getEvent(id);
    db.prepare('DELETE FROM events WHERE id = ?').run(id);
    res.json({ message: 'Event and its attendee registrations deleted.' });
  });

  app.get('/api/attendees', (req, res) => {
    const search = String(req.query.search ?? '').trim();
    const clauses = ['instr(lower(a.name || \' \' || a.email || \' \' || e.name), lower(?)) > 0'];
    const params = [search];
    if (req.query.eventId !== undefined && req.query.eventId !== '') {
      clauses.push('a.event_id = ?');
      params.push(positiveId(req.query.eventId, 'Event'));
    }
    if (req.query.ticketType !== undefined && req.query.ticketType !== '') {
      if (!ticketTypes.includes(req.query.ticketType)) throw new ApiError(400, 'Choose General, VIP, or Student as the ticket type.');
      clauses.push('a.ticket_type = ?');
      params.push(req.query.ticketType);
    }
    const attendees = db.prepare(`${attendeeSelect} WHERE ${clauses.join(' AND ')} ORDER BY a.created_at DESC, a.id DESC`).all(...params);
    res.json({ attendees });
  });
  app.post('/api/attendees', (req, res) => {
    const values = validateAttendee(req.body);
    const attendee = transaction(() => {
      ensureRegistrationAllowed(values);
      const result = db.prepare('INSERT INTO attendees (event_id, name, email, ticket_type) VALUES (?, ?, ?, ?)')
        .run(values.eventId, values.name, values.email, values.ticketType);
      return getAttendee(Number(result.lastInsertRowid));
    });
    res.status(201).json({ attendee });
  });
  app.patch('/api/attendees/:id', (req, res) => {
    const id = positiveId(req.params.id, 'Attendee');
    const attendee = transaction(() => {
      const values = validateAttendee(req.body, getAttendee(id));
      ensureRegistrationAllowed(values, id);
      db.prepare('UPDATE attendees SET event_id = ?, name = ?, email = ?, ticket_type = ? WHERE id = ?')
        .run(values.eventId, values.name, values.email, values.ticketType, id);
      return getAttendee(id);
    });
    res.json({ attendee });
  });
  app.delete('/api/attendees/:id', (req, res) => {
    const id = positiveId(req.params.id, 'Attendee');
    getAttendee(id);
    db.prepare('DELETE FROM attendees WHERE id = ?').run(id);
    res.json({ message: 'Attendee registration deleted.' });
  });
  app.get('/api/stats', (_req, res) => {
    const events = db.prepare(`${eventSelect} GROUP BY e.id`).all().map(serializeEvent);
    const future = events.filter((event) => event.status !== 'past');
    res.json({ stats: {
      totalEvents: events.length,
      upcomingEvents: future.length,
      totalAttendees: db.prepare('SELECT COUNT(*) AS count FROM attendees').get().count,
      availableSpots: future.reduce((total, event) => total + event.spotsRemaining, 0),
    } });
  });

  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'API endpoint not found.')));
  app.use(express.static(join(projectRoot, 'public')));
  app.use((_req, _res, next) => next(new ApiError(404, 'Page not found.')));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request contains invalid JSON.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large.' });
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message, ...(error.fields ? { fields: error.fields } : {}) });
    console.error('Unexpected server error:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return { app, db, close: () => db.close() };
}
