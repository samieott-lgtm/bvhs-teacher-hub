require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const pgSessionFactory = require('connect-pg-simple');
const bcrypt = require('bcryptjs');
const path = require('path');

const pool = require('./lib/db');
const store = require('./lib/store');
const RESOURCES = require('./lib/resources');
const PAGES = require('./lib/pages');
const { upload, UPLOAD_DIR } = require('./lib/uploads');
const { runMigrations } = require('./lib/migrate');

const app = express();
const PORT = process.env.PORT || 3000;
const PgSession = pgSessionFactory(session);

// ---- Basic setup ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'partials/layout');

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'bvhs-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 hours
  })
);

// Small helper so async route handlers don't need try/catch everywhere -
// any thrown error (e.g. a database hiccup) is passed to Express's error handler.
function ah(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

// Make settings + nav + login status available to every view automatically
app.use(
  ah(async (req, res, next) => {
    res.locals.settings = await store.getSettings();
    res.locals.currentUser = (req.session && req.session.user) || null;
    res.locals.isAdmin = !!(req.session && req.session.user && req.session.user.role === 'admin');
    res.locals.currentPath = req.path;
    res.locals.PAGES = PAGES;
    next();
  })
);

function requireStaff(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

// =========================================================================
// PUBLIC PAGES
// =========================================================================

app.get(
  '/',
  ah(async (req, res) => {
    const [announcementsRaw, weeklyRaw, eventsRaw, links, todos, deadlinesRaw] = await Promise.all([
      store.getAll('announcements'),
      store.getAll('weekly'),
      store.getAll('events'),
      store.getAll('links'),
      store.getAll('todos'),
      store.getAll('deadlines'),
    ]);

    const announcements = announcementsRaw.sort((a, b) =>
      a.pinned === b.pinned ? (a.date < b.date ? 1 : -1) : a.pinned ? -1 : 1
    );
    const weekly = weeklyRaw.sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1))[0];
    const today = new Date().toISOString().slice(0, 10);
    const events = eventsRaw
      .filter((e) => e.date >= today)
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .slice(0, 5);
    const deadlines = deadlinesRaw
      .filter((d) => d.dueDate >= today)
      .sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1))
      .slice(0, 5);

    res.render('home', { title: 'Home', announcements, weekly, events, links, todos, deadlines });
  })
);

// Any logged-in staff member can check items off the shared to-do list.
app.post(
  '/todos/:id/toggle',
  requireStaff,
  ah(async (req, res) => {
    const item = await store.getById('todos', req.params.id);
    if (item) {
      await store.updateItem('todos', req.params.id, { done: !item.done });
    }
    res.redirect('/');
  })
);

app.get(
  '/weekly-updates',
  ah(async (req, res) => {
    const weekly = (await store.getAll('weekly')).sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1));
    res.render('weekly', { title: 'Weekly Updates', weekly });
  })
);

app.get(
  '/calendar',
  ah(async (req, res) => {
    const events = (await store.getAll('events')).sort((a, b) => (a.date > b.date ? 1 : -1));
    res.render('calendar', { title: 'Calendar', events });
  })
);

function renderTextPage(key) {
  return ah(async (req, res) => {
    const page = await store.getPage(key);
    res.render('text-page', { title: page.title, page });
  });
}

app.get('/mustang-time', renderTextPage('mustangTime'));
app.get('/hrs', renderTextPage('hrs'));
app.get('/student-support', renderTextPage('studentSupport'));
app.get('/attendance-discipline', renderTextPage('attendanceDiscipline'));
app.get('/procedures', renderTextPage('procedures'));

app.get(
  '/forms',
  ah(async (req, res) => {
    const documents = await store.getAll('documents');
    const grouped = {};
    documents.forEach((d) => {
      if (!grouped[d.category]) grouped[d.category] = [];
      grouped[d.category].push(d);
    });
    res.render('forms', { title: 'Forms & Documents', grouped });
  })
);

app.get(
  '/professional-development',
  ah(async (req, res) => {
    const pd = (await store.getAll('pd')).sort((a, b) => (a.date > b.date ? 1 : -1));
    res.render('pd', { title: 'Professional Development', pd });
  })
);

app.get(
  '/staff-directory',
  ah(async (req, res) => {
    const staff = (await store.getAll('staff')).sort((a, b) => (a.name > b.name ? 1 : -1));
    res.render('staff', { title: 'Staff Directory', staff });
  })
);

// =========================================================================
// LOGIN (shared by staff and admin - role decides what they can access)
// =========================================================================

function safeNext(value, fallback) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}

app.get('/login', (req, res) => {
  const next = safeNext(req.query.next, '/');
  res.render('login', { title: 'Staff Login', error: null, next, layout: 'partials/admin-layout' });
});

app.post(
  '/login',
  ah(async (req, res) => {
    const { username, password } = req.body;
    const next = safeNext(req.body.next, '/');

    const user = await store.getUserByUsername((username || '').trim());
    const valid = user && (await bcrypt.compare(password || '', user.password_hash));

    if (!valid) {
      return res.render('login', {
        title: 'Staff Login',
        error: 'That username or password is not correct. Please try again.',
        next,
        layout: 'partials/admin-layout',
      });
    }

    req.session.user = { id: user.id, username: user.username, name: user.name, role: user.role };
    // Staff (non-admin) accounts can't land in the admin area even if that was requested.
    const destination = next.startsWith('/admin') && user.role !== 'admin' ? '/' : next;
    res.redirect(destination);
  })
);

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Old links from Phase 1 still work.
app.get('/admin/login', (req, res) => res.redirect('/login' + (req.query.next ? `?next=${encodeURIComponent(req.query.next)}` : '')));
app.post('/admin/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

// =========================================================================
// ADMIN DASHBOARD
// =========================================================================

app.get('/admin', requireAdmin, (req, res) => {
  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    layout: 'partials/admin-layout',
    resources: RESOURCES,
    pages: PAGES,
  });
});

// ---- Generic CRUD for list-type resources (announcements, events, etc.) ----

// Only the "documents" resource accepts a file upload alongside its fields.
function maybeUpload(req, res, next) {
  if (req.params.resource === 'documents') {
    return upload.single('file')(req, res, next);
  }
  next();
}

app.get(
  '/admin/:resource',
  requireAdmin,
  ah(async (req, res, next) => {
    const config = RESOURCES[req.params.resource];
    if (!config) return next();
    let items = await store.getAll(req.params.resource);
    if (config.sortBy) {
      items = items.slice().sort((a, b) => {
        const av = config.sortBy(a);
        const bv = config.sortBy(b);
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return config.sortDir === 'desc' ? -cmp : cmp;
      });
    }
    res.render('admin/resource-list', {
      title: config.label,
      layout: 'partials/admin-layout',
      resourceKey: req.params.resource,
      config,
      items,
    });
  })
);

app.get('/admin/:resource/new', requireAdmin, (req, res, next) => {
  const config = RESOURCES[req.params.resource];
  if (!config) return next();
  res.render('admin/resource-form', {
    title: `Add - ${config.label}`,
    layout: 'partials/admin-layout',
    resourceKey: req.params.resource,
    config,
    item: {},
    isNew: true,
  });
});

app.post(
  '/admin/:resource/new',
  requireAdmin,
  maybeUpload,
  ah(async (req, res, next) => {
    const config = RESOURCES[req.params.resource];
    if (!config) return next();
    const item = buildItemFromBody(config, req.body);
    if (req.params.resource === 'documents' && req.file) {
      item.url = '/uploads/' + req.file.filename;
    }
    await store.addItem(req.params.resource, item);
    res.redirect(`/admin/${req.params.resource}`);
  })
);

app.get(
  '/admin/:resource/:id/edit',
  requireAdmin,
  ah(async (req, res, next) => {
    const config = RESOURCES[req.params.resource];
    if (!config) return next();
    const item = await store.getById(req.params.resource, req.params.id);
    if (!item) return res.redirect(`/admin/${req.params.resource}`);
    res.render('admin/resource-form', {
      title: `Edit - ${config.label}`,
      layout: 'partials/admin-layout',
      resourceKey: req.params.resource,
      config,
      item,
      isNew: false,
    });
  })
);

app.post(
  '/admin/:resource/:id/edit',
  requireAdmin,
  maybeUpload,
  ah(async (req, res, next) => {
    const config = RESOURCES[req.params.resource];
    if (!config) return next();
    const updates = buildItemFromBody(config, req.body);
    if (req.params.resource === 'documents' && req.file) {
      updates.url = '/uploads/' + req.file.filename;
    }
    await store.updateItem(req.params.resource, req.params.id, updates);
    res.redirect(`/admin/${req.params.resource}`);
  })
);

app.post(
  '/admin/:resource/:id/delete',
  requireAdmin,
  ah(async (req, res, next) => {
    const config = RESOURCES[req.params.resource];
    if (!config) return next();
    await store.deleteItem(req.params.resource, req.params.id);
    res.redirect(`/admin/${req.params.resource}`);
  })
);

function buildItemFromBody(config, body) {
  const item = {};
  config.fields.forEach((field) => {
    if (field.type === 'checkbox') {
      item[field.name] = body[field.name] === 'on' || body[field.name] === 'true';
    } else {
      item[field.name] = (body[field.name] || '').trim();
    }
  });
  return item;
}

// ---- Free-text pages (Mustang Time, HRS, Student Support, etc.) ----

app.get(
  '/admin/pages/:key',
  requireAdmin,
  ah(async (req, res, next) => {
    const pageConfig = PAGES[req.params.key];
    if (!pageConfig) return next();
    const page = await store.getPage(req.params.key);
    res.render('admin/page-form', {
      title: `Edit - ${pageConfig.label}`,
      layout: 'partials/admin-layout',
      pageKey: req.params.key,
      pageConfig,
      page,
    });
  })
);

app.post(
  '/admin/pages/:key',
  requireAdmin,
  ah(async (req, res, next) => {
    const pageConfig = PAGES[req.params.key];
    if (!pageConfig) return next();
    await store.setPage(req.params.key, {
      title: (req.body.title || '').trim(),
      body: (req.body.body || '').trim(),
    });
    res.redirect('/admin');
  })
);

// ---- Site settings (school name, tagline) ----

app.get(
  '/admin/settings/general',
  requireAdmin,
  ah(async (req, res) => {
    res.render('admin/settings-form', {
      title: 'Site Settings',
      layout: 'partials/admin-layout',
      settings: await store.getSettings(),
    });
  })
);

app.post(
  '/admin/settings/general',
  requireAdmin,
  ah(async (req, res) => {
    await store.setSettings({
      schoolName: (req.body.schoolName || '').trim(),
      mascot: (req.body.mascot || '').trim(),
      tagline: (req.body.tagline || '').trim(),
    });
    res.redirect('/admin');
  })
);

// ---- Staff accounts (admin only) ----

app.get(
  '/admin/users',
  requireAdmin,
  ah(async (req, res) => {
    const users = await store.getAllUsers();
    res.render('admin/users-list', { title: 'Staff Accounts', layout: 'partials/admin-layout', users });
  })
);

app.get('/admin/users/new', requireAdmin, (req, res) => {
  res.render('admin/users-form', {
    title: 'Add Staff Account',
    layout: 'partials/admin-layout',
    user: {},
    isNew: true,
    error: null,
  });
});

app.post(
  '/admin/users/new',
  requireAdmin,
  ah(async (req, res) => {
    const { username, name, password, role } = req.body;
    if (!username || !password) {
      return res.render('admin/users-form', {
        title: 'Add Staff Account',
        layout: 'partials/admin-layout',
        user: req.body,
        isNew: true,
        error: 'Username and a temporary password are both required.',
      });
    }
    const existing = await store.getUserByUsername(username.trim());
    if (existing) {
      return res.render('admin/users-form', {
        title: 'Add Staff Account',
        layout: 'partials/admin-layout',
        user: req.body,
        isNew: true,
        error: 'That username is already taken.',
      });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await store.addUser({
      username: username.trim(),
      name: (name || '').trim(),
      passwordHash,
      role: role === 'admin' ? 'admin' : 'staff',
    });
    res.redirect('/admin/users');
  })
);

app.get(
  '/admin/users/:id/edit',
  requireAdmin,
  ah(async (req, res) => {
    const user = await store.getUserById(req.params.id);
    if (!user) return res.redirect('/admin/users');
    res.render('admin/users-form', {
      title: 'Edit Staff Account',
      layout: 'partials/admin-layout',
      user,
      isNew: false,
      error: null,
    });
  })
);

app.post(
  '/admin/users/:id/edit',
  requireAdmin,
  ah(async (req, res) => {
    const { name, role, password } = req.body;
    await store.updateUser(req.params.id, { name: (name || '').trim(), role: role === 'admin' ? 'admin' : 'staff' });
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await store.updateUserPassword(req.params.id, passwordHash);
    }
    res.redirect('/admin/users');
  })
);

app.post(
  '/admin/users/:id/delete',
  requireAdmin,
  ah(async (req, res) => {
    const target = await store.getUserById(req.params.id);
    if (target && target.role === 'admin') {
      const adminCount = await store.countAdmins();
      if (adminCount <= 1) {
        return res.redirect('/admin/users'); // never delete the last admin
      }
    }
    await store.deleteUser(req.params.id);
    res.redirect('/admin/users');
  })
);

// =========================================================================

app.use((req, res) => {
  res.status(404).render('404', { title: 'Page not found' });
});

// Friendly error page instead of a raw crash trace, e.g. if the database is unreachable.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('500', { title: 'Something went wrong' });
});

async function start() {
  try {
    await runMigrations();
    app.listen(PORT, () => {
      console.log(`BVHS Teacher Hub running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start - this is usually a database connection problem:', err);
    process.exit(1);
  }
}

start();
