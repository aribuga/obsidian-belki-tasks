# belki 0.4.3

Patch release focused on a better desktop add-task flow, narrow-pane navigation, and Obsidian review cleanup.

## Added

- **Desktop floating task composer** - On desktop, clicking `+ Add task` now opens a compact floating composer above the current task list instead of inserting the composer inline at the bottom.
- **Collapsible sidebar** - The desktop belki sidebar can now collapse into an icon-only rail and remembers the preferred layout.

## Improved

- Opening the desktop task composer preserves the current task list scroll position.
- The floating composer keeps contextual defaults such as Today due dates, Upcoming defaults, and selected project defaults.
- Date, label, deadline, and project popovers were adjusted for the floating composer.
- The Projects header add button now has a quieter transparent background.
- Sidebar collapse controls use panel icons, a transparent background, and a more muted visual style.

## Fixed

- Removed the default Quick Add hotkey to avoid conflicts with user or Obsidian shortcuts.
- Replaced one HTMLElement check with Obsidian's cross-window-safe `instanceOf` helper.
- Cleaned up settings tab refresh calls that triggered Obsidian review warnings.

## Internal

- Split the large root stylesheet into ordered partial CSS files while keeping the generated root `styles.css` for releases.
- Completed focused extraction passes from large UI/store modules for maintainability.
- Added a small unit test setup for composer context behavior.

## Breaking Changes

- None expected.
