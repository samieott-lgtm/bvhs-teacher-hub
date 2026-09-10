// This file defines every list-type piece of content the principal can manage
// in the admin area, and what fields each item has. Adding a new field here
// automatically adds it to the admin add/edit forms - no other code changes needed.

module.exports = {
  announcements: {
    label: 'Principal Announcements',
    description: 'Shown on the home dashboard. Pin the most important one to the top.',
    sortBy: (item) => (item.pinned ? '0' : '1') + (item.date || ''),
    sortDir: 'desc',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'body', label: 'Message', type: 'textarea', required: true },
      { name: 'pinned', label: 'Pin to top of dashboard', type: 'checkbox' },
    ],
  },
  weekly: {
    label: 'Weekly Updates',
    description: 'The "This Week at BVHS" post. Most recent week appears first.',
    sortBy: (item) => item.weekOf || '',
    sortDir: 'desc',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'weekOf', label: 'Week of', type: 'date', required: true },
      { name: 'body', label: 'Details', type: 'textarea', required: true },
    ],
  },
  events: {
    label: 'Upcoming Events / Calendar',
    description: 'Events shown on the dashboard and the Calendar page.',
    sortBy: (item) => item.date || '',
    sortDir: 'asc',
    fields: [
      { name: 'title', label: 'Event title', type: 'text', required: true },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'time', label: 'Time (optional)', type: 'text' },
      { name: 'location', label: 'Location (optional)', type: 'text' },
      { name: 'description', label: 'Details (optional)', type: 'textarea' },
    ],
  },
  links: {
    label: 'Quick Links',
    description: 'Shortcut buttons shown on the home dashboard.',
    fields: [
      { name: 'label', label: 'Button text', type: 'text', required: true },
      { name: 'url', label: 'Link (full web address)', type: 'text', required: true },
    ],
  },
  todos: {
    label: 'Teacher To-Do List',
    description: 'Shared checklist shown on the home dashboard for all staff.',
    fields: [
      { name: 'text', label: 'Task', type: 'text', required: true },
      { name: 'done', label: 'Completed', type: 'checkbox' },
    ],
  },
  deadlines: {
    label: 'Important Deadlines',
    description: 'Shown on the home dashboard, soonest first.',
    sortBy: (item) => item.dueDate || '',
    sortDir: 'asc',
    fields: [
      { name: 'title', label: 'Deadline title', type: 'text', required: true },
      { name: 'dueDate', label: 'Due date', type: 'date', required: true },
      { name: 'description', label: 'Details (optional)', type: 'textarea' },
    ],
  },
  documents: {
    label: 'Forms & Documents',
    description: 'Each form links out to a file or web form. Group related forms with the same category name.',
    fields: [
      { name: 'category', label: 'Category (e.g. Field Trips, HR)', type: 'text', required: true },
      { name: 'title', label: 'Form or document name', type: 'text', required: true },
      { name: 'url', label: 'Link', type: 'text', required: true },
    ],
  },
  staff: {
    label: 'Staff Directory',
    description: 'Contact information shown on the Staff Directory page.',
    sortBy: (item) => item.name || '',
    sortDir: 'asc',
    fields: [
      { name: 'name', label: 'Full name', type: 'text', required: true },
      { name: 'role', label: 'Position / title', type: 'text', required: true },
      { name: 'department', label: 'Department', type: 'text' },
      { name: 'email', label: 'Email', type: 'text' },
      { name: 'room', label: 'Room', type: 'text' },
      { name: 'phone', label: 'Phone extension', type: 'text' },
    ],
  },
  pd: {
    label: 'Professional Development',
    description: 'Training and conference opportunities shown on the PD page.',
    sortBy: (item) => item.date || '',
    sortDir: 'asc',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'description', label: 'Details', type: 'textarea' },
      { name: 'link', label: 'Sign-up link (optional)', type: 'text' },
    ],
  },
};
