const icons = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2m-8 3h2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ticket: '<path d="M4 5h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6V6a1 1 0 0 1 1-1Z"/><path d="M15 5v2m0 3v1m0 3v1m0 3v1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  sparkles: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Zm8 0v4m-2-2h4"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
  code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/>',
  coffee: '<path d="M18 8h1a3 3 0 1 1 0 6h-1M3 8h15v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8Zm3-6v3m4-3v3m4-3v3"/>',
  connection: '<circle cx="12" cy="5" r="3"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="m10.5 8-4 7m7-7 4 7M8 18h8"/>',
};
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.calendar}</svg>`;
const escape = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const state = { view: 'events', filter: 'all', search: '', eventId: '', sort: 'date-asc', layout: 'grid', events: [], attendees: [], stats: null, loaded: false };
const categories = ['Conference', 'Workshop', 'Meetup', 'Networking', 'Other'];
const tickets = ['General', 'VIP', 'Student'];
const categoryTheme = { Conference: ['purple', 'mic'], Workshop: ['blue', 'code'], Meetup: ['orange', 'coffee'], Networking: ['green', 'connection'], Other: ['pink', 'sparkles'] };
let formContext = null;
let deletion = null;
let refreshSequence = 0;
let detailSequence = 0;
let detailEventId = null;
let searchTimer;
let busyDialog = null;

function hydrateIcons(scope = document) { $$('[data-icon]', scope).forEach((el) => { el.innerHTML = icon(el.dataset.icon); }); }
function initials(name) { return name.trim().split(/\s+/).slice(0, 2).map((word) => [...word][0] || '').join('').toUpperCase(); }
function readableDate(value, options = {}) { return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...options }).format(new Date(`${value}T12:00:00`)); }
function readableTime(time) { const [hour, minute] = time.split(':'); return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) >= 12 ? 'PM' : 'AM'}`; }
function todayValue() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function option(value, selected, label = value, disabled = false) { return `<option value="${escape(value)}"${String(value) === String(selected) ? ' selected' : ''}${disabled ? ' disabled' : ''}>${escape(label)}</option>`; }
function statusBadge(event) { return `<span class="status-badge ${event.status}">${event.status === 'past' ? 'Past event' : event.status === 'full' ? 'Fully booked' : 'Upcoming'}</span>`; }
function showToast(message) { const toast = document.createElement('div'); toast.className = 'toast'; toast.innerHTML = `${icon('check')}<span>${escape(message)}</span>`; $('#toast-region').append(toast); setTimeout(() => toast.remove(), 4500); }

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const body = await response.json().catch(() => ({ error: 'The server returned an unexpected response.' }));
  if (!response.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
  return body;
}

function setConnection(connected) {
  $('#connection-label').textContent = connected ? 'All changes saved locally' : 'Connection unavailable';
  $('#connection-dot').classList.toggle('offline', !connected);
}

async function refresh() {
  const sequence = ++refreshSequence;
  $('#records').setAttribute('aria-busy', 'true');
  try {
    const [eventData, attendeeData, statsData] = await Promise.all([api('/events'), api('/attendees'), api('/stats')]);
    if (sequence !== refreshSequence) return;
    state.events = eventData.events;
    state.attendees = attendeeData.attendees;
    state.stats = statsData.stats;
    state.loaded = true;
    $('#load-error').hidden = true;
    setConnection(true);
    renderStats();
    populateEventFilter();
    renderRecords();
    return true;
  } catch (error) {
    if (sequence !== refreshSequence) return;
    setConnection(false);
    $('#load-error').hidden = false;
    $('#load-error').innerHTML = `${escape(error.message)} <button class="button secondary" data-action="retry">Try again</button>`;
    if (!state.loaded) $('#records').innerHTML = '';
    return false;
  } finally {
    if (sequence === refreshSequence) $('#records').setAttribute('aria-busy', 'false');
  }
}

function renderStats() {
  const stats = state.stats;
  for (const [id, value] of [['events', stats.totalEvents], ['upcoming', stats.upcomingEvents], ['attendees', stats.totalAttendees], ['spots', stats.availableSpots]]) $(`#stat-${id}`).textContent = value.toLocaleString('en-IN');
  $('#nav-events').textContent = stats.totalEvents;
  $('#nav-attendees').textContent = stats.totalAttendees;
}

function populateEventFilter() {
  if (!state.events.some((event) => String(event.id) === state.eventId)) state.eventId = '';
  $('#attendee-event').innerHTML = option('', state.eventId, 'All events') + state.events.map((event) => option(event.id, state.eventId, event.name)).join('');
}

function filteredEvents() {
  const query = state.search.toLocaleLowerCase();
  const events = state.events.filter((event) => (state.filter === 'all' || (state.filter === 'upcoming' ? event.status !== 'past' : event.status === state.filter)) && [event.name, event.venue, event.category].some((value) => value.toLocaleLowerCase().includes(query)));
  return events.sort((a, b) => state.sort === 'name' ? a.name.localeCompare(b.name) : (state.sort === 'date-desc' ? -1 : 1) * `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

function filteredAttendees() {
  const query = state.search.toLocaleLowerCase();
  return state.attendees.filter((attendee) => (!state.eventId || String(attendee.eventId) === state.eventId) && [attendee.name, attendee.email, attendee.eventName].some((value) => value.toLocaleLowerCase().includes(query))).sort((a, b) => state.sort === 'name' ? a.name.localeCompare(b.name) : (state.sort === 'date-desc' ? -1 : 1) * a.eventDate.localeCompare(b.eventDate));
}

function cardMenu(event) {
  return `<details class="card-menu"><summary class="icon-button" aria-label="Actions for ${escape(event.name)}">${icon('more')}</summary><div class="menu-panel"><button data-action="view-event" data-id="${event.id}">${icon('info')}View details</button><button data-action="edit-event" data-id="${event.id}">${icon('edit')}Edit event</button><button class="destructive" data-action="delete-event" data-id="${event.id}">${icon('trash')}Delete event</button></div></details>`;
}

function renderCard(event) {
  const [tone, symbol] = categoryTheme[event.category] || categoryTheme.Other;
  const attendees = state.attendees.filter((attendee) => attendee.eventId === event.id);
  return `<article class="event-card tone-${tone}">
    <div class="event-card-top"><div class="event-symbol">${icon(symbol)}</div><div class="event-card-tools">${statusBadge(event)}${cardMenu(event)}</div></div>
    <div class="event-card-body"><div class="category-label">${escape(event.category)}</div><h3 class="event-title"><button data-action="view-event" data-id="${event.id}">${escape(event.name)}</button></h3><p class="event-description" title="${escape(event.description)}">${escape(event.description || 'A new occasion to come together.')}</p>
    <div class="event-meta"><div class="meta-row">${icon('calendar')}<span>${readableDate(event.date)} <span aria-hidden="true">·</span> ${readableTime(event.time)}</span></div><div class="meta-row">${icon('pin')}<span title="${escape(event.venue)}">${escape(event.venue)}</span></div></div>
    <div class="capacity"><div class="capacity-label"><span><strong>${event.attendeeCount}</strong> / ${event.capacity} registered</span><span>${event.spotsRemaining === 0 ? 'At capacity' : `${event.spotsRemaining} spots left`}</span></div><div class="progress-track" role="meter" aria-label="Event capacity" aria-valuemin="0" aria-valuemax="${event.capacity}" aria-valuenow="${event.attendeeCount}"><div class="progress-fill" style="width:${Math.min(event.attendeeCount / event.capacity * 100, 100)}%"></div></div></div></div>
    <div class="event-card-footer"><div class="attendee-stack" aria-label="${event.attendeeCount} registered attendees">${attendees.length ? attendees.slice(0, 3).map((attendee) => `<span class="mini-avatar" title="${escape(attendee.name)}">${escape(initials(attendee.name))}</span>`).join('') + (attendees.length > 3 ? `<span class="mini-avatar more">+${attendees.length - 3}</span>` : '') : '<span class="no-attendees">Be the first to join</span>'}</div><button class="register-button" data-action="register" data-id="${event.id}" ${event.spotsRemaining <= 0 ? 'disabled' : ''}>${icon('plus')}${event.spotsRemaining <= 0 ? 'Fully booked' : 'Register attendee'}</button></div>
  </article>`;
}

function renderEventTable(events) {
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Event</th><th scope="col">Date & time</th><th scope="col">Venue</th><th scope="col">Registrations</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>${events.map((event) => `<tr><td><button class="table-title-button table-event" data-action="view-event" data-id="${event.id}">${escape(event.name)}</button><div class="person-email">${escape(event.category)}</div></td><td>${readableDate(event.date)}<div class="person-email">${readableTime(event.time)}</div></td><td>${escape(event.venue)}</td><td>${event.attendeeCount} / ${event.capacity}</td><td>${statusBadge(event)}</td><td><div class="row-actions"><button class="icon-button" data-action="register" data-id="${event.id}" aria-label="Register for ${escape(event.name)}" ${event.spotsRemaining <= 0 ? 'disabled' : ''}>${icon('plus')}</button><button class="icon-button" data-action="edit-event" data-id="${event.id}" aria-label="Edit ${escape(event.name)}">${icon('edit')}</button><button class="icon-button" data-action="delete-event" data-id="${event.id}" aria-label="Delete ${escape(event.name)}">${icon('trash')}</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

function renderAttendeeTable(attendees) {
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Attendee</th><th scope="col">Event</th><th scope="col">Event date</th><th scope="col">Ticket type</th><th scope="col">Actions</th></tr></thead><tbody>${attendees.map((attendee) => `<tr><td><div class="person-cell"><div class="avatar">${escape(initials(attendee.name))}</div><div><div class="person-name">${escape(attendee.name)}</div><div class="person-email">${escape(attendee.email)}</div></div></div></td><td><button class="table-title-button table-event" data-action="view-event" data-id="${attendee.eventId}">${escape(attendee.eventName)}</button></td><td>${readableDate(attendee.eventDate)}</td><td><span class="ticket-badge ticket-${attendee.ticketType.toLowerCase()}">${escape(attendee.ticketType)}</span></td><td><div class="row-actions"><button class="icon-button" data-action="edit-attendee" data-id="${attendee.id}" aria-label="Edit ${escape(attendee.name)}">${icon('edit')}</button><button class="icon-button" data-action="delete-attendee" data-id="${attendee.id}" aria-label="Delete ${escape(attendee.name)}">${icon('trash')}</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

function renderEmpty() {
  const filtered = state.search || (state.view === 'events' ? state.filter !== 'all' : state.eventId);
  const isEvents = state.view === 'events';
  return `<div class="empty-state"><div class="empty-icon">${icon(filtered ? 'search' : isEvents ? 'calendar' : 'users')}</div><h3>${filtered ? 'No matches just yet' : isEvents ? 'Your next great event starts here' : 'Make room for your first attendee'}</h3><p>${filtered ? 'Try another search or clear your filters to see all records.' : isEvents ? 'Create an event, set the details, and start bringing people together.' : 'Register someone for an event to start building your guest list.'}</p><button class="button primary" data-action="${filtered ? 'clear-filters' : isEvents || !state.events.length ? 'create-event' : 'register'}">${icon(filtered ? 'x' : 'plus')}${filtered ? 'Clear filters' : isEvents || !state.events.length ? 'Create event' : 'Register attendee'}</button></div>`;
}

function renderRecords() {
  if (!state.loaded) return;
  const records = state.view === 'events' ? filteredEvents() : filteredAttendees();
  $('#result-count').textContent = records.length;
  const title = state.view === 'events' ? ({ all: 'All events', upcoming: 'Upcoming events', past: 'Past events', full: 'Fully booked events' })[state.filter] : 'All attendees';
  $('#records-title').firstChild.textContent = `${title} `;
  $('#records').innerHTML = records.length ? state.view === 'events' ? state.layout === 'grid' ? `<div class="events-grid">${records.map(renderCard).join('')}</div>` : renderEventTable(records) : renderAttendeeTable(records) : renderEmpty();
  const total = state.view === 'events' ? state.events.length : state.attendees.length;
  $('#results-summary').textContent = `Showing ${records.length} of ${total} ${state.view === 'events' ? total === 1 ? 'event' : 'events' : total === 1 ? 'attendee' : 'attendees'}`;
}

function changeView() {
  state.view = location.hash === '#attendees' ? 'attendees' : 'events';
  state.search = ''; state.eventId = '';
  $('#search').value = '';
  const events = state.view === 'events';
  const title = events ? 'Events' : 'Attendees';
  document.title = `${title} — Gather`;
  $('#breadcrumb-current').textContent = title;
  $('#page-title').textContent = title;
  $('#page-description').textContent = events ? 'Bring people together. We’ll help with the details.' : 'Great events begin with the people who show up.';
  $('#section-hint').textContent = events ? 'A place for every occasion.' : 'Every guest, in one place.';
  $('#search').placeholder = events ? 'Search events…' : 'Search name, email or event…';
  $('#search').setAttribute('aria-label', events ? 'Search events' : 'Search attendees by name, email or event');
  $('#primary-action').dataset.action = events ? 'create-event' : 'register';
  $('#primary-action').innerHTML = `${icon('plus')}<span>${events ? 'Create event' : 'Register attendee'}</span>`;
  $('#event-tabs').hidden = !events;
  $('#attendee-event-wrap').hidden = events;
  $('#view-toggle').hidden = !events;
  $$('[data-view]').forEach((link) => { link.classList.toggle('active', link.dataset.view === state.view); if (link.dataset.view === state.view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  populateEventFilter(); renderRecords();
}

function closeDialog(id) { if (busyDialog === id) return; const dialog = $(`#${id}`); dialog.close(); if (id === 'detail-dialog') { detailEventId = null; detailSequence++; } }
function openForm(kind, record = null, selectedEvent = null) {
  if (busyDialog) return;
  if (!state.loaded) { showToast('Please wait for the workspace to connect.'); return; }
  if (kind === 'attendee' && !state.events.length) { showToast('Create an event before registering an attendee.'); openForm('event'); return; }
  if ($('#detail-dialog').open) closeDialog('detail-dialog');
  formContext = { kind, record };
  const edit = Boolean(record);
  $('#record-form').reset();
  $('#form-error').hidden = true;
  $('#form-submit').disabled = false;
  $('#dialog-title').textContent = kind === 'event' ? edit ? 'Edit event' : 'Create an event' : edit ? 'Edit attendee' : 'Register an attendee';
  $('#dialog-eyebrow').textContent = kind === 'event' ? 'MAKE IT HAPPEN' : 'BRING PEOPLE TOGETHER';
  $('#form-submit').textContent = edit ? 'Save changes' : kind === 'event' ? 'Create event' : 'Register attendee';
  if (kind === 'event') {
    const event = record || { name: '', date: todayValue(), time: '10:00', venue: '', capacity: 50, category: 'Conference', description: '' };
    $('#form-fields').innerHTML = `<div class="field-grid"><div class="field full-width"><label for="event-name">Event name</label><input id="event-name" name="name" value="${escape(event.name)}" placeholder="e.g. Design & coffee" required maxlength="120" autocomplete="off"></div><div class="field"><label for="event-date">Date</label><input id="event-date" name="date" type="date" value="${event.date}" min="1900-01-01" max="9999-12-31" required></div><div class="field"><label for="event-time">Time</label><input id="event-time" name="time" type="time" value="${event.time}" required></div><div class="field full-width"><label for="event-venue">Venue</label><input id="event-venue" name="venue" value="${escape(event.venue)}" placeholder="e.g. Innovation Hub, Pune" required maxlength="180"></div><div class="field"><label for="event-capacity">Capacity</label><input id="event-capacity" name="capacity" type="number" value="${event.capacity}" min="${Math.max(event.attendeeCount || 0, 1)}" max="1000000" step="1" required><small>Maximum number of attendees.</small></div><div class="field"><label for="event-category">Category</label><select id="event-category" name="category">${categories.map((category) => option(category, event.category)).join('')}</select></div><div class="field full-width"><label for="event-description">Description <span>(optional)</span></label><textarea id="event-description" name="description" maxlength="2000" placeholder="What makes this event worth showing up for?">${escape(event.description)}</textarea></div></div>`;
  } else {
    const attendee = record || { name: '', email: '', ticketType: 'General', eventId: selectedEvent?.id || '' };
    const available = state.events.filter((event) => event.spotsRemaining > 0 || event.id === attendee.eventId);
    $('#form-fields').innerHTML = `<div class="field-grid"><div class="field full-width"><label for="registration-event">Event</label><select id="registration-event" name="eventId" required>${option('', attendee.eventId, 'Choose an event')}${state.events.map((event) => option(event.id, attendee.eventId, `${event.name}${event.spotsRemaining === 0 ? ' (full)' : ''}`, !available.includes(event))).join('')}</select><small>${available.length ? 'Each email can be registered once per event.' : 'All events are full. Increase an event’s capacity or create another event.'}</small></div><div id="registration-summary" class="registration-summary" hidden></div><div class="field full-width"><label for="attendee-name">Full name</label><input id="attendee-name" name="name" value="${escape(attendee.name)}" placeholder="e.g. Alex Morgan" required maxlength="120" autocomplete="name"></div><div class="field full-width"><label for="attendee-email">Email address</label><input id="attendee-email" name="email" type="email" value="${escape(attendee.email)}" placeholder="alex@example.com" required maxlength="254" autocomplete="email"></div><div class="field full-width"><label for="attendee-ticket">Ticket type</label><select id="attendee-ticket" name="ticketType">${tickets.map((ticket) => option(ticket, attendee.ticketType)).join('')}</select></div></div>`;
    $('#registration-event').addEventListener('change', updateRegistrationSummary);
    $('#form-submit').disabled = !available.length;
    updateRegistrationSummary();
  }
  $('#form-dialog').showModal();
}

function updateRegistrationSummary() {
  const event = state.events.find((item) => String(item.id) === $('#registration-event').value);
  const summary = $('#registration-summary'); summary.hidden = !event;
  if (event) summary.innerHTML = `<strong>${escape(event.name)}</strong><br>${readableDate(event.date)} at ${readableTime(event.time)} · ${escape(event.venue)}<br>${event.spotsRemaining} of ${event.capacity} spots available`;
}

async function submitForm(submitEvent) {
  submitEvent.preventDefault();
  const { kind, record } = formContext;
  const button = $('#form-submit');
  if (button.disabled) return;
  const values = Object.fromEntries(new FormData($('#record-form')));
  if (kind === 'event') values.capacity = Number(values.capacity);
  else values.eventId = Number(values.eventId);
  const label = button.textContent;
  busyDialog = 'form-dialog';
  $('#record-form').setAttribute('aria-busy', 'true');
  button.disabled = true; button.textContent = 'Saving…'; $('#form-error').hidden = true;
  try {
    await api(`/${kind === 'event' ? 'events' : 'attendees'}${record ? `/${record.id}` : ''}`, { method: record ? 'PATCH' : 'POST', body: JSON.stringify(values) });
    await refresh();
    busyDialog = null;
    closeDialog('form-dialog');
    showToast(record ? 'Changes saved.' : kind === 'event' ? 'Your event is ready. Let’s bring people together.' : 'Attendee registered successfully.');
  } catch (error) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; }
  finally { busyDialog = null; $('#record-form').setAttribute('aria-busy', 'false'); if (formContext?.record === record && formContext?.kind === kind) { button.disabled = false; button.textContent = label; } }
}

async function openDetails(id) {
  const sequence = ++detailSequence;
  detailEventId = id;
  const cached = state.events.find((event) => event.id === id);
  $('#detail-content').innerHTML = `<div class="dialog-header"><h2 id="detail-title">${escape(cached?.name || 'Event details')}</h2><button class="icon-button" data-close-dialog="detail-dialog" aria-label="Close event details">${icon('x')}</button></div><div class="loading-state"><span class="spinner"></span>Loading event…</div>`;
  if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
  try {
    const [{ event }, { attendees }] = await Promise.all([api(`/events/${id}`), api(`/attendees?eventId=${id}`)]);
    if (sequence !== detailSequence) return;
    state.events = [...state.events.filter((item) => item.id !== event.id), event];
    state.attendees = [...state.attendees.filter((item) => item.eventId !== event.id), ...attendees];
    $('#detail-content').innerHTML = `<div class="dialog-header"><div><div class="eyebrow">${escape(event.category.toUpperCase())}</div><h2 id="detail-title">${escape(event.name)}</h2></div><button class="icon-button" data-close-dialog="detail-dialog" aria-label="Close event details">${icon('x')}</button></div>${statusBadge(event)}<div class="event-meta"><div class="meta-row">${icon('calendar')}<span>${readableDate(event.date)} · ${readableTime(event.time)}</span></div><div class="meta-row">${icon('pin')}<span>${escape(event.venue)}</span></div><div class="meta-row">${icon('users')}<span>${event.attendeeCount} of ${event.capacity} registered</span></div><div class="meta-row">${icon('ticket')}<span>${event.spotsRemaining} spots available</span></div></div><p class="detail-description">${escape(event.description || 'No description added.')}</p><div class="detail-section-title"><h3>Attendees <span class="count-badge">${attendees.length}</span></h3><button class="text-button" style="margin:0" data-action="show-event-attendees" data-id="${id}">Open directory ${icon('arrow-right')}</button></div><div class="detail-attendees">${attendees.length ? attendees.map((attendee) => `<div class="detail-attendee"><div class="avatar">${escape(initials(attendee.name))}</div><div><div class="person-name">${escape(attendee.name)}</div><div class="person-email">${escape(attendee.email)}</div></div><span class="ticket-badge ticket-${attendee.ticketType.toLowerCase()}">${escape(attendee.ticketType)}</span><div class="row-actions"><button class="icon-button" data-action="edit-attendee" data-id="${attendee.id}" aria-label="Edit ${escape(attendee.name)}">${icon('edit')}</button><button class="icon-button" data-action="delete-attendee" data-id="${attendee.id}" aria-label="Delete ${escape(attendee.name)}">${icon('trash')}</button></div></div>`).join('') : '<p class="detail-empty">The guest list is waiting for its first name.</p>'}</div><div class="dialog-footer"><button class="button secondary" data-action="edit-event" data-id="${id}">${icon('edit')}Edit event</button><button class="button primary" data-action="register" data-id="${id}" ${event.spotsRemaining <= 0 ? 'disabled' : ''}>${icon('plus')}Register attendee</button></div>`;
  } catch (error) {
    if (sequence !== detailSequence) return;
    $('#detail-content').innerHTML = `<div class="dialog-header"><h2 id="detail-title">Event unavailable</h2><button class="icon-button" data-close-dialog="detail-dialog" aria-label="Close event details">${icon('x')}</button></div><p>${escape(error.message)}</p>`;
  }
}

function confirmDelete(kind, record) {
  if (!record || busyDialog) return;
  deletion = { kind, record };
  $('#confirm-title').textContent = `Delete ${kind}?`;
  $('#confirm-delete').textContent = `Delete ${kind}`;
  $('#confirm-delete').disabled = false;
  $('#confirm-error').hidden = true;
  $('#confirm-description').textContent = kind === 'event' ? `“${record.name}” and its ${record.attendeeCount} attendee registration${record.attendeeCount === 1 ? '' : 's'} will be permanently deleted. This can’t be undone.` : `Remove ${record.name} from ${record.eventName}? Their registration will be permanently deleted and their spot will become available.`;
  $('#confirm-dialog').showModal();
}

async function deleteRecord() {
  if (!deletion || $('#confirm-delete').disabled) return;
  const { kind, record } = deletion;
  busyDialog = 'confirm-dialog';
  $('#confirm-delete').disabled = true;
  $('#confirm-delete').textContent = 'Deleting…';
  try {
    await api(`/${kind === 'event' ? 'events' : 'attendees'}/${record.id}`, { method: 'DELETE' });
    await refresh();
    busyDialog = null;
    closeDialog('confirm-dialog');
    if (kind === 'event' && $('#detail-dialog').open) closeDialog('detail-dialog');
    showToast(kind === 'event' ? 'Event and its registrations deleted.' : 'Attendee registration deleted.');
    if (detailEventId && $('#detail-dialog').open) openDetails(detailEventId);
  } catch (error) { $('#confirm-error').textContent = error.message; $('#confirm-error').hidden = false; }
  finally { busyDialog = null; if (deletion?.record === record) { $('#confirm-delete').disabled = false; $('#confirm-delete').textContent = `Delete ${kind}`; } }
}

document.addEventListener('click', (clickEvent) => {
  const close = clickEvent.target.closest('[data-close-dialog]');
  if (close) closeDialog(close.dataset.closeDialog);
  const filter = clickEvent.target.closest('[data-filter]');
  if (filter) { state.filter = filter.dataset.filter; $$('[data-filter]').forEach((button) => { const active = button === filter; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); }); renderRecords(); }
  const layout = clickEvent.target.closest('[data-layout]');
  if (layout) { state.layout = layout.dataset.layout; $$('[data-layout]').forEach((button) => { const active = button === layout; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); }); renderRecords(); }
  const action = clickEvent.target.closest('[data-action]');
  if (action) {
    const id = Number(action.dataset.id);
    const event = state.events.find((item) => item.id === id);
    const attendee = state.attendees.find((item) => item.id === id);
    $$('details[open]').forEach((menu) => menu.removeAttribute('open'));
    switch (action.dataset.action) {
      case 'create-event': openForm('event'); break;
      case 'edit-event': if (event) openForm('event', event); break;
      case 'register': openForm('attendee', null, event); break;
      case 'edit-attendee': if (attendee) openForm('attendee', attendee); break;
      case 'delete-event': confirmDelete('event', event); break;
      case 'delete-attendee': confirmDelete('attendee', attendee); break;
      case 'view-event': openDetails(id); break;
      case 'retry': refresh(); break;
      case 'clear-filters': state.search = ''; state.filter = 'all'; state.eventId = ''; $('#search').value = ''; $('#attendee-event').value = ''; $$('[data-filter]').forEach((button) => { const active = button.dataset.filter === 'all'; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); }); renderRecords(); break;
      case 'show-event-attendees': closeDialog('detail-dialog'); if (location.hash !== '#attendees') { history.pushState(null, '', '#attendees'); changeView(); } state.eventId = String(id); $('#attendee-event').value = String(id); renderRecords(); break;
    }
  } else if (!clickEvent.target.closest('.card-menu')) $$('details[open]').forEach((menu) => menu.removeAttribute('open'));
});

$('#record-form').addEventListener('submit', submitForm);
$('#confirm-delete').addEventListener('click', deleteRecord);
$('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.search = $('#search').value.trim(); renderRecords(); }, 120); });
$('#sort').addEventListener('change', () => { state.sort = $('#sort').value; renderRecords(); });
$('#attendee-event').addEventListener('change', () => { state.eventId = $('#attendee-event').value; renderRecords(); });
window.addEventListener('hashchange', changeView);
window.addEventListener('popstate', changeView);
document.addEventListener('keydown', (event) => { if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest('input,textarea,select,[contenteditable]') && !$$('dialog[open]').length) { event.preventDefault(); $('#search').focus(); } });
$$('dialog').forEach((dialog) => { dialog.addEventListener('cancel', (event) => { if (busyDialog === dialog.id) event.preventDefault(); }); dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog.id); } }); });
$('#detail-dialog').addEventListener('cancel', () => { detailEventId = null; detailSequence++; });
hydrateIcons();
$('#today').textContent = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
changeView();
api('/health').then((health) => { $('#demo-banner').hidden = !health.demoMode; }).catch(() => {});
await refresh();
