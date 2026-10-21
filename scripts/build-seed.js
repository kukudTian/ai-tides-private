#!/usr/bin/env node
// Packages the current local post/referral data into the Cloudflare function folder.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUT_DIR = path.join(ROOT, 'cloudflare', 'functions', '_data');

const posts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'posts.json'), 'utf8'));
const referrals = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'referrals.json'), 'utf8')) || {};

const normalized = posts.map((p) => {
  const recommendUrl = String(referrals[p.slug] || p.recommendUrl || '').trim();
  return {
    ...p,
    recommendUrl,
    featured: p.featured ? 1 : 0,
    hotScore: Number(p.hotScore) || 0,
  };
});

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'seed-posts.json'), JSON.stringify(normalized, null, 2), 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'referrals.json'), JSON.stringify(referrals, null, 2), 'utf8');

console.log(`seed data written: ${normalized.length} posts, ${Object.keys(referrals).length} referrals`);
