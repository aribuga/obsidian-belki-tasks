#!/usr/bin/env node
"use strict";

const { writeFileSync, readdirSync, unlinkSync, mkdirSync, existsSync } = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "test-vaults", "belki-test", "_belki_files", "Data");

// ── Date helpers ─────────────────────────────────────────────────────────────

function fmt(date) {
  // Use local date components, not toISOString() — converting to UTC can
  // shift the calendar day backwards/forwards depending on the local timezone offset.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

const today = new Date();
today.setHours(0, 0, 0, 0);

const d = {
  today:      fmt(today),
  yesterday:  fmt(addDays(today, -1)),
  lastWeek:   fmt(addDays(today, -7)),
  tomorrow:   fmt(addDays(today, 1)),
  nextWeek:   fmt(addDays(today, 7)),
  twoWeeks:   fmt(addDays(today, 14)),
  lastMonth:  fmt(addDays(today, -30)),
};

const yearMonth = d.today.slice(0, 7);   // e.g. "2026-06"
const prevYearMonth = d.lastWeek.slice(0, 7);

// ── Clear existing data files ─────────────────────────────────────────────────

mkdirSync(dataDir, { recursive: true });

for (const file of readdirSync(dataDir)) {
  if (/^\d{4}-\d{2}\.md$/.test(file)) {
    unlinkSync(path.join(dataDir, file));
  }
}

// ── Sample task data ──────────────────────────────────────────────────────────
// Format mirrors what belki serializes: each task is a list item with indented
// field:: value lines. `due` controls which monthly file the task lives in.

const currentMonthTasks = `\
- [ ] Buy groceries
  id:: test-inbox-001
  created:: ${d.today}
  due:: ${d.today}
  priority:: P3

- [ ] This is a task with a very long title that should wrap or truncate gracefully in the board card without breaking the layout
  id:: test-inbox-long
  created:: ${d.today}
  due:: ${d.today}
  priority:: P4

- [ ] Read chapter 4 of design book
  id:: test-inbox-desc
  created:: ${d.today}
  due:: ${d.today}
  priority:: P4
  description:: Take notes on the section about visual hierarchy and color theory. Write a short summary for your notes.

- [ ] Redesign landing page hero
  id:: test-web-001
  created:: ${d.today}
  due:: ${d.today}
  deadline:: ${d.tomorrow}
  project:: Website
  priority:: P2
  description:: Update hero section with new brand colors and larger CTA button. Mobile viewport must be tested.
  labels:: design, review

- [ ] Write API documentation
  id:: test-web-002
  created:: ${d.today}
  due:: ${d.today}
  deadline:: ${d.twoWeeks}
  project:: Website
  priority:: P3
  labels:: development

- [ ] Fix broken checkout flow
  id:: test-web-urgent
  created:: ${d.lastWeek}
  due:: ${d.today}
  deadline:: ${d.yesterday}
  project:: Website
  priority:: P1
  description:: Users cannot complete purchases on mobile Safari. Investigate and patch before the weekend.
  labels:: urgent, development

- [x] Set up CI pipeline
  id:: test-web-done
  created:: ${d.lastWeek}
  completed:: ${d.today}
  due:: ${d.today}
  project:: Website
  priority:: P2
  labels:: development

- [ ] Water the plants
  id:: test-personal-repeat
  created:: ${d.today}
  due:: ${d.today}
  repeat:: {"f":"daily","i":1,"m":"s","e":"n"}
  project:: Personal
  priority:: P4
  labels:: home

- [ ] Schedule dentist appointment
  id:: test-personal-upcoming
  created:: ${d.today}
  due:: ${d.nextWeek}
  deadline:: ${d.twoWeeks}
  project:: Personal
  priority:: P3

- [x] Buy birthday gift for Alex
  id:: test-personal-done
  created:: ${d.lastWeek}
  completed:: ${d.today}
  due:: ${d.today}
  project:: Personal
  priority:: P3
  labels:: errand

- [ ] Weekly review
  id:: test-personal-weekly
  created:: ${d.today}
  due:: ${d.today}
  repeat:: {"f":"weekly","i":1,"m":"s","e":"n","w":1}
  project:: Personal
  priority:: P3
  description:: Review last week, plan next week. Check all open projects.

- [ ] Refactor authentication module
  id:: test-parent-001
  created:: ${d.today}
  due:: ${d.today}
  deadline:: ${d.nextWeek}
  project:: Website
  priority:: P2
  description:: Break the auth module into smaller composable parts. Parent task — see subtasks.
  labels:: development

- [x] Extract token validation helper
  id:: test-child-001a
  created:: ${d.today}
  completed:: ${d.today}
  due:: ${d.today}
  project:: Website
  priority:: P2
  labels:: development
  parentId:: test-parent-001

- [ ] Write unit tests for auth module
  id:: test-child-001b
  created:: ${d.today}
  due:: ${d.today}
  project:: Website
  priority:: P2
  labels:: development
  parentId:: test-parent-001

- [ ] Update session expiry logic
  id:: test-child-001c
  created:: ${d.today}
  due:: ${d.today}
  project:: Website
  priority:: P3
  labels:: development
  parentId:: test-parent-001

- [ ] Organize photo library
  id:: test-inbox-photos
  created:: ${d.today}
  due:: ${d.nextWeek}
  priority:: P4
  labels:: home

- [ ] Draft Q3 retrospective
  id:: test-work-retro
  created:: ${d.today}
  due:: ${d.tomorrow}
  deadline:: ${d.nextWeek}
  project:: Personal
  priority:: P2
  description:: Summarize wins, blockers, and goals for next quarter. Keep it under one page.
  labels:: writing

- [x] Archive completed sprint tasks
  id:: test-work-archive
  created:: ${d.lastWeek}
  completed:: ${d.yesterday}
  due:: ${d.yesterday}
  project:: Website
  priority:: P3
  labels:: development
`;

// Previous month file — provides an overdue task from a past month
const prevMonthTasks = prevYearMonth !== yearMonth ? `\
- [ ] Renew domain registration
  id:: test-overdue-domain
  created:: ${d.lastMonth}
  due:: ${d.lastWeek}
  deadline:: ${d.lastWeek}
  project:: Website
  priority:: P1
  labels:: urgent
` : "";

// ── Write files ───────────────────────────────────────────────────────────────

writeFileSync(path.join(dataDir, `${yearMonth}.md`), currentMonthTasks, "utf8");
console.log(`  ✓ Wrote _belki_files/Data/${yearMonth}.md`);

if (prevMonthTasks) {
  writeFileSync(path.join(dataDir, `${prevYearMonth}.md`), prevMonthTasks, "utf8");
  console.log(`  ✓ Wrote _belki_files/Data/${prevYearMonth}.md (overdue task from last month)`);
}

console.log("\nTest vault data reset. Run `npm run test:vault` to also refresh plugin files.");
