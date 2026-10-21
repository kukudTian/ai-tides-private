// Renders precompiled EJS templates inside Cloudflare Pages Functions.
const templates = require('../_templates');
const { escapeHtml } = require('./utils');

function renderTemplate(name, data = {}) {
  const fn = templates[name];
  if (!fn) throw new Error(`Template not found: ${name}`);
  const locals = { ...(data || {}) };
  const include = (path, includeData) =>
    renderTemplate(path, { ...locals, ...(includeData || {}) });
  const rethrow = (err) => {
    throw err;
  };
  return fn(locals, escapeHtml, include, rethrow);
}

module.exports = { renderTemplate };
