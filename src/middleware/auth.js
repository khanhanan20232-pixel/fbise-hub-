// src/middleware/auth.js
function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Please log in.' });
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Please log in.' });
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  if (req.session.role !== 'admin') {
    return res.status(403).render('error', {
      title: 'Access denied',
      message: 'This area is for administrators only.',
      user: req.session,
      status: 403,
    });
  }
  next();
}

// Attach user object to request for convenience (non-blocking)
async function attachUser(req, res, next) {
  res.locals.currentUser = null;
  if (req.session && req.session.userId) {
    res.locals.currentUser = {
      id: req.session.userId,
      name: req.session.name,
      email: req.session.email,
      role: req.session.role,
      classLevel: req.session.classLevel,
    };
  }
  next();
}

module.exports = { requireLogin, requireAdmin, attachUser };
