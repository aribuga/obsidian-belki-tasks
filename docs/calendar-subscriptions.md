# Calendar Subscriptions

belki can display read-only iCal subscription events inline inside Today and Upcoming.

This is a live subscription, not a one-time import. When the remote feed changes, belki updates the displayed events on the next refresh.

## What It Does

- Shows iCal events in Today and Upcoming date sections.
- Keeps belki tasks and calendar events separate.
- Supports multiple private or public iCal feeds.
- Supports Google Calendar private iCal links and other HTTPS iCal feeds.
- Opens an event externally only when the event contains a valid HTTP or HTTPS URL.
- Keeps task counts task-only.

## What It Does Not Do

- It does not create, edit, delete, or sync calendar events.
- It does not convert events into tasks.
- It does not write event data into belki task Markdown files.
- It does not request Google API scopes.
- It does not add a separate Calendar view.

## Add A Google Calendar Feed

1. Open Google Calendar in a browser.
2. Open Settings.
3. Select the calendar under "Settings for my calendars".
4. Open "Integrate calendar".
5. Copy "Secret address in iCal format".
6. In Obsidian, open Settings -> belki -> Calendar.
7. Click "Add iCal calendar".
8. Paste the link, choose a name and color, then add the calendar.

Each Google calendar is added separately. Some managed work or school accounts may disable private iCal links.

Google's "Public address in iCal format" works only when that calendar is publicly shared. For a normal private calendar, use "Secret address in iCal format" instead.

Treat the private iCal link like a password. Anyone with the link can read that calendar feed. If a link leaks, reset it from Google Calendar settings.

## Feed URLs

belki accepts:

- `https://` URLs
- `webcal://` URLs, which are converted to HTTPS

belki rejects unsafe or unsupported protocols such as `javascript:`, `data:`, `file:`, `ftp:`, plain HTTP, malformed URLs, and URLs with embedded username/password credentials.

belki also blocks obvious private or local network targets before making a request, including localhost, loopback IPs, private IPv4 ranges, link-local addresses, IPv6 loopback, IPv6 local/private ranges, and common metadata-service hostnames. Obsidian's request API may follow redirects without exposing the final URL to the plugin, so belki cannot fully validate every redirect target after the request leaves the plugin.

Saved URLs are masked in settings. Query parameters and long secret path tokens are not shown in feed rows or errors.

## Refresh

belki refreshes enabled feeds:

- after adding a calendar
- after replacing a URL
- after re-enabling a calendar
- when Today or Upcoming asks for stale calendar data
- every 15 minutes while Obsidian is open
- when Obsidian regains focus or becomes visible again, if the feed is stale
- when you press Refresh

Automatic refreshes use ETag and Last-Modified request metadata when available. HTTP 304 responses keep the existing in-memory events and update refresh metadata. Manual Refresh skips those conditional headers so it can ask the provider for a fresh feed body.

Resume/focus refreshes are debounced so rapid focus and visibility events do not start repeated requests. Each feed has at most one effective refresh in flight at a time.

One failing feed does not hide events from other working feeds. On refresh failure, belki keeps the last successful in-memory events for that feed and shows a subtle settings error.

Automatic refreshes use feed-specific backoff after consecutive failures:

- first failure: retry at the next normal refresh opportunity
- second failure: wait 30 minutes
- third failure: wait 1 hour
- fourth and later failures: wait up to 2 hours

Manual Refresh always tries immediately, even while automatic refresh is waiting.

## Limits

Remote iCal responses are limited to 5 MB. belki rejects oversized feeds before parsing when the response declares its size, and also checks the received body size.

Recurring event expansion is bounded to the requested Today/Upcoming window plus a small date buffer. A feed can expand up to 10,000 recurrence instances while scanning and can produce up to 5,000 normalized display events for the requested window. These limits keep task views responsive when a remote calendar contains very large or pathological recurrence data.

## Event Data

belki keeps only normalized fields required for display:

- event id
- feed id
- UID and recurrence identity
- calendar name and color
- title
- start and end
- all-day flag
- event URL when available
- status
- source time zone when relevant

belki does not intentionally retain event descriptions, attendees, organizers, alarms, attachments, conferencing details, or private notes.

## Date Rules

- Timed events appear on the local date where they begin.
- Cross-midnight timed events appear only on their starting date.
- All-day events appear on each covered date.
- All-day DTEND dates are exclusive.
- Cancelled events do not appear.
- Recurring events expand only within the requested window plus a small safety buffer.
- EXDATE removes excluded instances.
- RECURRENCE-ID overrides replace or cancel individual recurring instances.

## Troubleshooting

If a feed fails to add, confirm that the URL opens as an iCal feed in a browser and uses HTTPS or webcal.

If Google returns 404 for a public iCal link, the calendar is probably not publicly shared. If Google returns 404 for a Secret address, open the same URL in a browser. It should download an `.ics` file. If it does not, reset the secret iCal URL in Google Calendar settings and paste the new link into belki.

If events appear on an unexpected date, check the calendar service time zone and the device time zone.

If recurring events look wrong, try Refresh. If the feed contains unusual recurrence rules, belki may not display every provider-specific edge case.

If an event row is not clickable, the event probably does not include a valid HTTP or HTTPS URL and belki could not resolve a provider fallback. For Google Calendar iCal feeds, rows without event URLs open Google Calendar on the event's local date as a convenience. This day-view fallback is provider-specific and is not part of the iCal standard. belki does not invent exact event links from UIDs.

Removing a calendar subscription deletes the saved URL and in-memory events for that feed. It does not modify belki tasks.
