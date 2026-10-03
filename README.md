# Gather — Event & Attendee Management

Gather is a full-stack web application for creating events, registering attendees, searching records, and managing event capacity. It uses HTML, CSS, and JavaScript in the browser, an Express server running on Node.js, and a SQLite database.

## Aim

To demonstrate how a browser interface, REST API, and relational database work together to manage event and attendee records without reloading the page.

The project covers:

- Event details: name, date, venue, and capacity.
- Attendee details: name, email, and ticket type.
- Creating, listing, updating, and deleting records.
- Searching attendees by name and event.
- A one-to-many relationship between events and attendees.
- Required-field validation, valid email addresses, duplicate registration prevention, and capacity checks.

## Requirements

- **Node.js 24 or newer.** The application uses Node's built-in SQLite support, so older Node.js versions are not supported.
- npm, which is included with Node.js.
- A current web browser.

No separate database server or database account is needed.

## Run locally

Open a terminal in this project folder and run:

```sh
npm install
npm start
```

On Windows, after installing dependencies, you can also double-click `start-gather.cmd`.

Open **http://localhost:3000** in your browser. Keep the terminal running while using the app. Press **Ctrl+C** in the terminal to stop the server.

The application starts with an empty database. Add your own event, then register an attendee to it. Records are saved in `data/events.sqlite` and remain there after the server restarts. To load the optional demonstration data, run:

```sh
npm run seed
npm start
```

The seed adds four events and ten attendees without replacing existing records. Event dates are set relative to the day you run it. A database marker prevents repeated seed runs from adding the demonstration data again.

For automatic server restarts while editing files:

```sh
npm run dev
```

If PowerShell blocks `npm.ps1` because of its script execution policy, use `npm.cmd` in the same commands, for example `npm.cmd install` and `npm.cmd start`.

If an existing npm installation reports a missing `npm-cli.js`, you can start this already-installed project directly with `node server/index.js` and run the tests with `node --test`. On this Windows machine, dependency installation also works with:

```powershell
node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' install
```

### Separate demo workspace

To explore sample data while keeping your own database empty, run:

```powershell
$env:DB_PATH = 'data/demo.sqlite'
$env:DEMO_MODE = 'true'
node server/seed.js
node server/index.js
```

This displays a demo banner. Open a new terminal and run `node server/index.js` to use your own workspace after stopping the demo server with **Ctrl+C**. Only one server can use port 3000 at a time.

### Using the interface

- **Events:** create an event, switch between grid and list layouts, search by name or venue, and filter upcoming, past, or full events. The upcoming filter includes full future events.
- **Event details:** click an event title to see its registrations, edit the event, or register someone.
- **Attendees:** search names, emails, or event names; filter by event; edit a registration or delete it.
- **Deletion:** the confirmation tells you which records will be removed. Deleting an event also deletes its registrations.
- **Keyboard:** press `/` to focus search. Forms support standard keyboard navigation, and Escape closes a form unless a save is in progress.

### Optional configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Server port. |
| `HOST` | `127.0.0.1` | Address the server listens on; local access by default. |
| `DB_PATH` | `data/events.sqlite` in the project folder | Location of the SQLite database. |
| `DEMO_MODE` | Disabled | Set to `true` to identify a demonstration instance through the health API. |

For example, to change the port in PowerShell:

```powershell
$env:PORT = '3001'
npm.cmd start
```

Then open `http://localhost:3001`. An environment variable set this way applies to the current terminal session.

## How the application works

1. The browser loads the HTML, CSS, and JavaScript from Express.
2. Browser JavaScript requests events and attendees through `fetch()`.
3. Express validates each request and runs the appropriate SQLite operation.
4. The API returns JSON, which the browser uses to refresh the visible records and totals.
5. If validation fails, the API returns an error and the interface displays it to the user.

Event capacity is enforced by the server. Browser validation improves the form experience, while server validation protects the database when requests arrive directly at the API.

For example, this browser-side request registers an attendee and reads the result:

```js
const response = await fetch('/api/attendees', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventId: 1, // Replace with an existing event ID.
    name: 'Priya Desai',
    email: 'priya@example.com',
    ticketType: 'Student'
  })
});

const result = await response.json();
if (!response.ok) throw new Error(result.error);
console.log(result.attendee);
```

## Data model

Each event can have many attendees. Each attendee registration belongs to one event.

```text
Event (1) ──────────── (many) Attendee registrations
```

A person may register for multiple events, but the same email address cannot be registered twice for the same event. Deleting an event also deletes the attendee registrations linked to it.

### SQLite tables

| Table | Columns | Constraints |
| --- | --- | --- |
| `events` | `id`, `name`, `date`, `time`, `venue`, `capacity`, `category`, `description`, `created_at` | Auto-increment primary key; required event fields; positive capacity. |
| `attendees` | `id`, `event_id`, `name`, `email`, `ticket_type`, `created_at` | Auto-increment primary key; foreign key to `events.id` with `ON DELETE CASCADE`; unique `(event_id, email)`; case-insensitive email comparison. |
| `app_metadata` | `key`, `value` | Stores the marker that makes demonstration seeding repeatable without duplicate data. |

The API exposes database names such as `event_id` and `ticket_type` as JavaScript-friendly `eventId` and `ticketType`. Event responses also include calculated `attendeeCount`, `spotsRemaining`, and `status` values.

SQL queries use bound parameters. Registration and attendee updates run in a database transaction so capacity checks and writes complete together.

## REST API

Send `Content-Type: application/json` with requests containing JSON. All API routes start with `/api`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Check that the server is running. |
| `GET` | `/api/stats` | Get event, attendee, and available-place totals. |
| `GET` | `/api/events` | List events; optionally filter with `search` and `status`. |
| `GET` | `/api/events/:id` | Read one event. |
| `POST` | `/api/events` | Create an event. |
| `PATCH` | `/api/events/:id` | Update selected event fields. |
| `DELETE` | `/api/events/:id` | Delete an event and its linked registrations. |
| `GET` | `/api/attendees` | List registrations; optionally filter with `search`, `eventId`, and `ticketType`. |
| `POST` | `/api/attendees` | Register an attendee to an event. |
| `PATCH` | `/api/attendees/:id` | Update a registration or move it to another event. |
| `DELETE` | `/api/attendees/:id` | Delete a registration and release its place. |

Examples of list filters:

```text
GET /api/events?search=workshop&status=upcoming
GET /api/attendees?search=priya
GET /api/attendees?eventId=1&ticketType=Student
```

Event search checks the event name, venue, and category. Attendee search checks the attendee name, email, and event name. Supported event statuses are `all`, `upcoming`, `past`, and `full`.

An event is `past` once its date and time have passed, otherwise it is `full` when capacity is reached, and `upcoming` when places remain. Date and time are interpreted in the server's local timezone. Past events remain editable and allow registrations for record management. In dashboard statistics, `upcomingEvents` includes all future events, including full ones; `availableSpots` counts places at future events only.

### Create an event

`POST /api/events`

```json
{
  "name": "JavaScript Workshop",
  "date": "2027-03-15",
  "time": "14:00",
  "venue": "Computer Lab A",
  "capacity": 30,
  "category": "Workshop",
  "description": "A hands-on introduction to building web applications."
}
```

The response has status `201` and shape `{ "event": { ... } }`. Use the returned event's `id` when registering attendees; it may differ from the example below.

### Register an attendee

`POST /api/attendees`

```json
{
  "eventId": 1,
  "name": "Priya Desai",
  "email": "priya@example.com",
  "ticketType": "Student"
}
```

The response has status `201` and shape `{ "attendee": { ... } }`.

### Update a record

`PATCH /api/events/1`

```json
{
  "venue": "Main Auditorium",
  "capacity": 50
}
```

Only send fields you want to change. Event and attendee updates return the updated record in an `event` or `attendee` object. List responses use `{ "events": [...] }` or `{ "attendees": [...] }`; delete responses use `{ "message": "..." }`.

### Validation and errors

- Event name, date, time, venue, and capacity are required. Dates must be real calendar dates in `YYYY-MM-DD` format, with a year between 1900 and 9999. Time uses 24-hour `HH:mm` format.
- Capacity must be a JSON number and a whole number from 1 to 1,000,000. It cannot be reduced below the number of existing registrations.
- Event categories are `Conference`, `Workshop`, `Meetup`, `Networking`, or `Other`. Category defaults to `Other`, and description defaults to an empty string.
- Attendee name, a valid email address, and an existing event ID are required. Ticket types are `General`, `VIP`, or `Student`; the default is `General`.
- Names allow up to 120 characters, venue 180, description 2,000, and email 254. Names and emails are trimmed; emails are stored in lowercase.
- Email uniqueness is per event and case-insensitive. The same email can be used for a different event.
- New registrations and transfers into a full event are rejected. Editing an attendee already in that event remains allowed.
- Missing event or attendee records return `404`; invalid inputs return `400`; duplicate registrations, full events, and capacity conflicts return `409`.

For example, a duplicate registration returns:

```json
{
  "error": "This email is already registered for this event.",
  "fields": {
    "email": "This attendee is already registered for this event."
  }
}
```

Malformed JSON returns `400`, and request bodies larger than 100 KB return `413`. The frontend reads these JSON errors and presents the message near the relevant form.

## Verification

Run the automated tests with:

```sh
npm test
```

Run the JavaScript syntax checks with:

```sh
npm run check
```

The integration tests in `test/api.test.js` start a real HTTP server with a separate temporary SQLite database. They cover:

- Event and attendee CRUD, partial updates, search, and filters.
- Required fields, invalid emails, impossible dates, invalid times, and capacity limits.
- Duplicate registrations, including email case differences.
- Registration for full or nonexistent events, plus releasing places after deletion.
- Concurrent registration attempts without exceeding capacity.
- Attendee transfers, failed-update rollback, and capacity reductions.
- Event deletion with cascading attendee deletion and preservation of unrelated records.
- Event status, dashboard totals, persisted records, malformed requests, and unknown routes.

These tests use their own databases and do not modify your saved event records.

For a manual demonstration:

1. Create an event with capacity `1`.
2. Register an attendee with a valid email address.
3. Attempt to register another attendee to the same event; it should be rejected because the event is full.
4. Try registering the original email again; a duplicate registration should be rejected.
5. Search for the attendee and select the relevant event.
6. Edit a record and verify the updated details appear without reloading the page.
7. Delete an attendee, then confirm that the released place can be used again.
8. Delete the event and verify that its linked attendee registrations are removed.

## Project structure

```text
event&attendee/
├── public/
│   ├── index.html       Browser interface and forms
│   ├── styles.css       Layout, responsive styles, and visual design
│   ├── app.js           Fetch requests and dynamic rendering
│   └── favicon.svg      Browser tab icon
├── server/
│   ├── index.js         Server startup and environment configuration
│   ├── app.js           Express routes, validation, and SQLite schema/queries
│   └── seed.js          Optional demonstration records
├── test/
│   └── api.test.js      HTTP API integration tests
├── data/
│   └── events.sqlite    Database created when the app first runs
├── package.json         Dependencies and npm commands
├── package-lock.json    Locked dependency versions
└── README.md            Setup and project documentation
```

## Intended use

This is a local educational CRUD project. It has no login system or authorization layer. Anyone who can reach the running server can manage its records. Use sample data when demonstrating the application; authentication and access controls would be needed before using it as a public service.
#   E v e n t - A t t e n d e e - P r o j e c t -  
 