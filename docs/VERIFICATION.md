# Verification

Verified on 27 September 2026 using Node.js 24.15.0.

## Automated checks

All 15 Node integration tests passed. Run `node --test` to repeat them against isolated temporary databases. Tests cover event and attendee CRUD, validation, case-insensitive duplicate registrations, full and missing events, concurrent registration attempts, capacity changes, registration transfers, search, filters, cascade deletion, persistence, and repeatable demo seeding.

JavaScript syntax checks passed for the server entry point and browser script.

## Browser checks

- Created a two-person event using the interface.
- Registered a VIP attendee and verified live registration and available-seat counts.
- Tried the same email with different capitalization; the form displayed the duplicate-registration error.
- Registered a second guest; the event displayed “Fully booked” and disabled further registration.
- Searched attendees by event name and selected an event filter.
- Edited an attendee, refreshed the page, and confirmed the updated record persisted.
- Checked the dashboard at 1440 px and the event form and attendee directory at 390 px. The page did not overflow horizontally; the wide attendee table scrolls within its container.
- No browser warnings or errors were captured during these checks.

The temporary browser-test event and its registrations were removed. The demo database retains only the four sample events and ten sample attendees.

The application is a local educational project. Authentication, payments, and email delivery are outside its scope.
