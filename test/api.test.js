import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';

const eventInput = (changes = {}) => ({
  name: 'Community Summit', date: '2099-08-20', time: '10:30', venue: 'City Hall', capacity: 10,
  category: 'Conference', description: 'A day of learning and connecting.', ...changes,
});
const attendeeInput = (eventId, changes = {}) => ({ eventId, name: 'Alex Patel', email: 'alex@example.com', ticketType: 'General', ...changes });

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'gather-test-'));
  const databasePath = join(directory, 'test.sqlite');
  const instance = createApp({ databasePath, ...options });
  const server = instance.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    instance.close();
    await rm(databasePath, { force: true });
    await rmdir(directory);
  });
  async function request(path, method = 'GET', body) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  const addEvent = async (changes) => {
    const response = await request('/api/events', 'POST', eventInput(changes));
    assert.equal(response.status, 201);
    return response.body.event;
  };
  const addAttendee = async (eventId, changes) => {
    const response = await request('/api/attendees', 'POST', attendeeInput(eventId, changes));
    assert.equal(response.status, 201);
    return response.body.attendee;
  };
  return { ...instance, databasePath, base, request, addEvent, addAttendee };
}

test('new installation starts empty and reports explicit demo mode', async (t) => {
  const api = await fixture(t);
  assert.deepEqual((await api.request('/api/health')).body, { status: 'ok', demoMode: false });
  assert.deepEqual((await api.request('/api/events')).body, { events: [] });
  assert.deepEqual((await api.request('/api/attendees')).body, { attendees: [] });
  assert.deepEqual((await api.request('/api/stats')).body.stats, { totalEvents: 0, upcomingEvents: 0, totalAttendees: 0, availableSpots: 0 });
  const preview = await fixture(t, { demoMode: true });
  assert.equal((await preview.request('/api/health')).body.demoMode, true);
});

test('event CRUD returns derived counts, partial updates, and sorted search results', async (t) => {
  const api = await fixture(t);
  const first = await api.addEvent({ name: '  Creative Summit  ', venue: '  Studio  ' });
  assert.equal(first.name, 'Creative Summit');
  assert.equal(first.venue, 'Studio');
  assert.equal(first.attendeeCount, 0);
  assert.equal(first.spotsRemaining, 10);
  assert.equal(first.status, 'upcoming');
  await api.addEvent({ name: 'Early Workshop', date: '2099-08-10', category: 'Workshop' });
  assert.equal((await api.request('/api/events')).body.events[0].name, 'Early Workshop');
  assert.equal((await api.request('/api/events?search=CREATIVE')).body.events.length, 1);
  assert.equal((await api.request('/api/events?search=studio')).body.events.length, 1);
  assert.equal((await api.request('/api/events?search=workshop')).body.events.length, 1);
  assert.equal((await api.request(`/api/events/${first.id}`)).body.event.name, 'Creative Summit');
  const changed = await api.request(`/api/events/${first.id}`, 'PATCH', { name: 'Updated Summit', capacity: 12 });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.event.name, 'Updated Summit');
  assert.equal(changed.body.event.capacity, 12);
  assert.equal(changed.body.event.date, first.date);
  assert.equal((await api.request(`/api/events/${first.id}`, 'DELETE')).status, 200);
  assert.equal((await api.request(`/api/events/${first.id}`)).status, 404);
});

test('event validation rejects missing fields, impossible dates, and invalid capacities', async (t) => {
  const api = await fixture(t);
  const empty = await api.request('/api/events', 'POST', {});
  assert.equal(empty.status, 400);
  assert.ok(empty.body.fields.name);
  for (const patch of [
    { date: '2026-02-30' }, { date: '2025-02-29' }, { date: '2099-13-01' }, { date: '01-02-2026' },
    { time: '24:00' }, { time: '9:30' }, { capacity: 0 }, { capacity: -1 }, { capacity: 2.5 },
    { capacity: '5' }, { capacity: 1000001 }, { venue: ' ' }, { category: 'Unknown' },
    { description: 'a'.repeat(2001) }, { name: 'a'.repeat(121) },
  ]) assert.equal((await api.request('/api/events', 'POST', eventInput(patch))).status, 400, JSON.stringify(patch));
  assert.equal((await api.request('/api/events', 'POST', eventInput({ date: '2024-02-29' }))).status, 201);
  assert.equal((await api.request('/api/events', 'POST', [])).status, 400);
});

test('attendee registration, update, search, filters, and deletion work', async (t) => {
  const api = await fixture(t);
  const event = await api.addEvent();
  const other = await api.addEvent({ name: 'JavaScript Lab', category: 'Workshop' });
  const attendee = await api.addAttendee(event.id, { name: '  Alex Patel  ', email: '  ALEX@EXAMPLE.COM  ' });
  assert.equal(attendee.name, 'Alex Patel');
  assert.equal(attendee.email, 'alex@example.com');
  assert.equal(attendee.eventName, event.name);
  assert.equal(attendee.eventDate, event.date);
  assert.ok(attendee.createdAt.endsWith('Z'));
  await api.addAttendee(other.id, { name: 'Sam Lee', email: 'sam@example.com', ticketType: 'Student' });
  for (const search of ['alex', 'PATEL', 'alex@example.com', 'community']) {
    const results = (await api.request(`/api/attendees?search=${encodeURIComponent(search)}`)).body.attendees;
    assert.equal(results.length, 1);
    assert.equal(results[0].id, attendee.id);
  }
  assert.equal((await api.request(`/api/attendees?eventId=${event.id}`)).body.attendees.length, 1);
  assert.equal((await api.request('/api/attendees?ticketType=Student')).body.attendees[0].name, 'Sam Lee');
  assert.equal((await api.request(`/api/attendees?eventId=${event.id}&ticketType=Student`)).body.attendees.length, 0);
  const updated = await api.request(`/api/attendees/${attendee.id}`, 'PATCH', { name: 'Alex Shah', ticketType: 'VIP' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.attendee.name, 'Alex Shah');
  assert.equal(updated.body.attendee.ticketType, 'VIP');
  assert.equal(updated.body.attendee.email, attendee.email);
  assert.equal((await api.request(`/api/events/${event.id}`)).body.event.attendeeCount, 1);
  assert.equal((await api.request(`/api/attendees/${attendee.id}`, 'DELETE')).status, 200);
  assert.equal((await api.request(`/api/events/${event.id}`)).body.event.attendeeCount, 0);
});

test('duplicate registration is case-insensitive but the same email can attend another event', async (t) => {
  const api = await fixture(t);
  const event = await api.addEvent();
  const other = await api.addEvent({ name: 'Another Summit' });
  await api.addAttendee(event.id);
  const duplicate = await api.request('/api/attendees', 'POST', attendeeInput(event.id, { email: 'ALEX@EXAMPLE.COM' }));
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.body.error, /already registered/);
  assert.equal((await api.addAttendee(other.id)).eventId, other.id);
  assert.equal((await api.request('/api/attendees')).body.attendees.length, 2);
});

test('full events reject new registrations and release a spot after deletion', async (t) => {
  const api = await fixture(t);
  const event = await api.addEvent({ capacity: 1 });
  const attendee = await api.addAttendee(event.id);
  const fullEvent = (await api.request(`/api/events/${event.id}`)).body.event;
  assert.equal(fullEvent.status, 'full');
  assert.equal(fullEvent.spotsRemaining, 0);
  const rejected = await api.request('/api/attendees', 'POST', attendeeInput(event.id, { email: 'second@example.com' }));
  assert.equal(rejected.status, 409);
  assert.match(rejected.body.error, /full/);
  assert.equal((await api.request(`/api/attendees/${attendee.id}`, 'PATCH', { name: 'Alex Updated' })).status, 200);
  await api.request(`/api/attendees/${attendee.id}`, 'DELETE');
  assert.equal((await api.request(`/api/events/${event.id}`)).body.event.status, 'upcoming');
  assert.equal((await api.addAttendee(event.id, { email: 'second@example.com' })).eventId, event.id);
});

test('concurrent requests never exceed capacity', async (t) => {
  const api = await fixture(t);
  const event = await api.addEvent({ capacity: 2 });
  const results = await Promise.all(Array.from({ length: 6 }, (_, index) => api.request('/api/attendees', 'POST', attendeeInput(event.id, { email: `person${index}@example.com` }))));
  assert.equal(results.filter((result) => result.status === 201).length, 2);
  assert.equal(results.filter((result) => result.status === 409).length, 4);
  assert.equal((await api.request(`/api/events/${event.id}`)).body.event.attendeeCount, 2);
});

test('nonexistent event and invalid attendee details are rejected without writes', async (t) => {
  const api = await fixture(t);
  const event = await api.addEvent();
  assert.equal((await api.request('/api/attendees', 'POST', attendeeInput(999999))).status, 404);
  for (const patch of [{ name: '' }, { email: 'bad-email' }, { email: 'a@b' }, { email: 'a@b..com' }, { email: 'a b@example.com' }, { ticketType: 'Gold' }, { eventId: 0 }, { eventId: '1' }]) {
    assert.equal((await api.request('/api/attendees', 'POST', attendeeInput(event.id, patch))).status, 400, JSON.stringify(patch));
  }
  assert.equal((await api.request('/api/attendees')).body.attendees.length, 0);
});

test('failed attendee transfers preserve original registration; valid transfers update counts', async (t) => {
  const api = await fixture(t);
  const source = await api.addEvent();
  const destination = await api.addEvent({ capacity: 1, name: 'Small Workshop' });
  const attendee = await api.addAttendee(source.id);
  const occupant = await api.addAttendee(destination.id, { email: 'occupant@example.com' });
  assert.equal((await api.request(`/api/attendees/${attendee.id}`, 'PATCH', { eventId: destination.id })).status, 409);
  assert.equal((await api.request(`/api/attendees/${attendee.id}`, 'PATCH', { eventId: 999999 })).status, 404);
  assert.equal((await api.request(`/api/attendees?eventId=${source.id}`)).body.attendees.length, 1);
  await api.request(`/api/attendees/${occupant.id}`, 'DELETE');
  const moved = await api.request(`/api/attendees/${attendee.id}`, 'PATCH', { eventId: destination.id });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.attendee.eventName, 'Small Workshop');
  assert.equal((await api.request(`/api/events/${source.id}`)).body.event.attendeeCount, 0);
  assert.equal((await api.request(`/api/events/${destination.id}`)).body.event.attendeeCount, 1);
});

test('updates enforce duplicate registration and minimum capacity', async (t) => {
  const api = await fixture(t);
  const event = await api.addEvent();
  await api.addAttendee(event.id);
  const second = await api.addAttendee(event.id, { email: 'second@example.com' });
  const duplicate = await api.request(`/api/attendees/${second.id}`, 'PATCH', { email: 'ALEX@example.com' });
  assert.equal(duplicate.status, 409);
  const lower = await api.request(`/api/events/${event.id}`, 'PATCH', { capacity: 1, name: 'Should not save' });
  assert.equal(lower.status, 409);
  const unchanged = (await api.request(`/api/events/${event.id}`)).body.event;
  assert.equal(unchanged.capacity, 10);
  assert.equal(unchanged.name, event.name);
  assert.equal((await api.request(`/api/events/${event.id}`, 'PATCH', { capacity: 2 })).body.event.status, 'full');
});

test('deleting an event cascades to its attendees and preserves unrelated records', async (t) => {
  const api = await fixture(t);
  const event = await api.addEvent();
  const other = await api.addEvent();
  const removed = await api.addAttendee(event.id);
  const preserved = await api.addAttendee(other.id);
  assert.equal((await api.request(`/api/events/${event.id}`, 'DELETE')).status, 200);
  const attendees = (await api.request('/api/attendees')).body.attendees;
  assert.deepEqual(attendees.map(({ id }) => id), [preserved.id]);
  assert.equal((await api.request(`/api/attendees/${removed.id}`, 'DELETE')).status, 404);
  assert.equal((await api.request(`/api/events/${event.id}`, 'DELETE')).status, 404);
});

test('status filters and summary counts distinguish past and full events', async (t) => {
  const api = await fixture(t);
  const full = await api.addEvent({ capacity: 1 });
  const past = await api.addEvent({ date: '2000-01-01', capacity: 1 });
  await api.addEvent({ capacity: 5 });
  await api.addAttendee(full.id);
  await api.addAttendee(past.id);
  const upcoming = (await api.request('/api/events?status=upcoming')).body.events;
  assert.equal(upcoming.length, 2);
  assert.ok(upcoming.some((event) => event.id === full.id));
  assert.ok(upcoming.every((event) => event.status !== 'past'));
  assert.equal((await api.request('/api/events?status=full')).body.events[0].id, full.id);
  assert.equal((await api.request('/api/events?status=past')).body.events[0].id, past.id);
  assert.deepEqual((await api.request('/api/stats')).body.stats, { totalEvents: 3, upcomingEvents: 2, totalAttendees: 2, availableSpots: 5 });
});

test('database records persist across app instances', async (t) => {
  const api = await fixture(t);
  const event = await api.addEvent();
  await api.addAttendee(event.id);
  const second = createApp({ databasePath: api.databasePath });
  try {
    assert.equal(second.db.prepare('SELECT COUNT(*) AS count FROM events').get().count, 1);
    assert.equal(second.db.prepare('SELECT COUNT(*) AS count FROM attendees').get().count, 1);
    assert.equal(second.db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  } finally { second.close(); }
});

test('explicit demo seed is idempotent and preserves pre-existing records', async (t) => {
  const api = await fixture(t);
  const original = await api.addEvent({ name: 'My Real Event' });
  await api.addAttendee(original.id);
  const seedPath = fileURLToPath(new URL('../server/seed.js', import.meta.url));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = spawnSync(process.execPath, [seedPath], {
      env: { ...process.env, DB_PATH: api.databasePath }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await api.request('/api/events')).body.events.length, 5);
    assert.equal((await api.request('/api/attendees')).body.attendees.length, 11);
    assert.equal((await api.request(`/api/events/${original.id}`)).body.event.name, 'My Real Event');
  }
});

test('invalid routes, IDs, filters, JSON, and oversized bodies return safe JSON errors', async (t) => {
  const api = await fixture(t);
  for (const route of ['/api/events/abc', '/api/events/0', '/api/attendees?eventId=1.5', '/api/events?status=unknown', '/api/attendees?ticketType=Gold']) {
    assert.equal((await api.request(route)).status, 400, route);
  }
  assert.equal((await api.request('/api/missing')).status, 404);
  assert.equal((await api.request('/api/attendees/1', 'PATCH', { name: 'No one' })).status, 404);
  const malformed = await fetch(`${api.base}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).error, /invalid JSON/);
  const tooLarge = await api.request('/api/events', 'POST', { name: 'a'.repeat(110000) });
  assert.equal(tooLarge.status, 413);
  const injection = await api.request("/api/events?search=';DROP%20TABLE%20events;--");
  assert.equal(injection.status, 200);
  assert.equal((await api.request('/api/health')).headers.get('cache-control'), 'no-store');
});
