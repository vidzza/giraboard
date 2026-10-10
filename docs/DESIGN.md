# Giraboard — Research and design decisions

*[Leer en español](DISENO.md)*

The goal: make sure **no task in a small office gets forgotten**, and that everyone always knows **who has it and how it's going**, with a tool simple enough to use without training.

## What the research showed

| Finding | Source | What we built |
|---|---|---|
| Tasks get lost because they're **committed in one place (a call, a WhatsApp chat) and tracked in another**. If capturing takes effort, people skip it. Target: capture in under 30 seconds. | Writing on "tasks falling through the cracks" (Tallyfy, ClientHub) | Only the **title is required**. There's quick capture on *My Day* (type and press Enter), and the **N** key opens "New task" from anywhere. |
| What gets forgotten most is **what depends on someone else**. GTD's *Waiting For* list solves it: write down **who/what you're waiting on** and **when to check again**. | Getting Things Done (GTD) | A dedicated **"Waiting"** status with a *"what are we waiting for?"* field and a **follow-up date**. Moving a card there prompts for both, and on that date it shows up under *Follow-ups due* on *My Day*. |
| Undated tasks never show up in "Today" and get forgotten. Todoist encourages **consciously rescheduling** instead of letting things go overdue. | Todoist (Today view), Things 3 | *My Day* splits **Overdue / Today / Follow-ups / Next 7 days / Undated**. **Snooze** (tomorrow, Monday, next week) can be undone, and the "Undated" section nudges you to add a date. |
| Cards nobody touches for days are the clearest sign of a forgotten task. Trello, Shortcut and Kanban Tool "age" cards at 7/14/28 days. | Card aging (Trello Power-Up, Shortcut, Kanbanchi) | After **7+ days without activity** a card turns yellowish, says **"N days idle"** and appears in *Going stale*. |
| Non-technical teams do best with **few columns** and **very clear status colors**. Monday.com's colored status is a big reason for its adoption. | Kanban for SMBs, Kanboard, Monday.com | Only **4 statuses**, each with a fixed color and icon across the app, changed with **4 big buttons** instead of menus. |
| Older and less tech-savvy users need 16px+ text, **icons always paired with labels**, large targets and messages that don't vanish quickly. | UX guidelines for older adults (NN/g and studies) | 16px base, 40–48px buttons, icon + word navigation, 6–10s dismissible toasts, **Undo** instead of confirmation dialogs, WCAG AA contrast. |
| Boards fill up and you can no longer see what's urgent. | Linear, Kanboard (filters) | Automatic ordering: **urgent first, then by due date** (no manual sorting), plus filters by person, type, urgent and overdue. |
| In service offices (insurance, accounting, real estate) many tasks **recur** and almost all are **tied to a client**. | Admin job descriptions | **Task-type templates** at setup (all editable), **clients** with history, **recurring tasks** and a **WhatsApp** button for each client. |
| The owner absorbs everyone's coordination and needs to see each person's workload without asking. | Writing on informal coordination in small teams | An **Overview** with workload per person, overdue items, what's been waiting longest, stale tasks, weekly throughput and a team activity feed, plus a **per-person board**. |

## The sections and why they look this way

1. **My Day** (home). Answers "what do I need to do today?". It shows a greeting with the date, a one-sentence summary, 4 counters, quick capture and lists ordered by urgency. You can view your own tasks, the whole team's or one person's.
2. **Board**. The big picture: 4 columns by status, or one per person. Drag to change status or reassign. Cards show type, client, due date, checklist progress, notes, attachments and whether they're going stale.
3. **Task detail** (side panel; full screen on phones). Everything autosaves. It includes:
   - status buttons, assignee, due date, client (with WhatsApp/call), type, priority, recurrence and notes
   - a **checklist with progress** and **attachments**
   - a **timeline** of progress notes and automatic history, with one-click @mentions
4. **Calendar**. Due dates and follow-ups by month.
5. **Clients**. Contact details, notes, open tasks and full history per client.
6. **Overview**. For whoever runs the office: key numbers, workload per person, waiting and stale items, weekly throughput (with a table view) and team activity.
7. **Archive**. Nothing is deleted; everything finished or archived is searchable.
8. **Team & settings**. People and roles, task types, business name, time zone, data export, profile and password.

## Reminders

- **In-app notifications** (bell) when:
  - you're assigned something, someone comments on your tasks or mentions you
  - someone finishes a task you created
  - a task is **due today**, **overdue** or **due for follow-up** (once per day)
- **Real time**: when a teammate moves something, everyone else's screen updates on its own.
- **Browser notifications** (opt-in) so you notice even when the tab is in the background.
- The unread count shows in the tab title: `(3) Giraboard`.

## Ideas for later

- Daily **email** or **WhatsApp** digest per person.
- English and other UI languages.
- **Push** notifications for the installed mobile app.
- Import clients and recurring deadlines from CSV to create tasks ahead of time.
