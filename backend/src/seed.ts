// Creates a password admin account (from ADMIN_* env vars, optional when
// signing in with GitHub) and, if the content tables are empty, some sample
// content. Safe to run more than once.
import { hashPassword } from './auth/password';
import { db } from './db';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME ?? 'Lab Admin';

if (!email || !password) {
  console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set; skipping the password admin account.');
} else if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
  console.log(`Admin ${email} already exists.`);
} else {
  db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'admin')").run(
    email,
    name,
    await hashPassword(password),
  );
  console.log(`Created admin ${email}.`);
}

const isEmpty = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n === 0;

if (isEmpty('people')) {
  const insert = db.prepare('INSERT INTO people (name, title, category, bio, sort_order) VALUES (?, ?, ?, ?, ?)');
  insert.run('Dr. Jane Doe', 'Principal Investigator', 'pi', 'Jane leads the lab.', 0);
  insert.run('Alex Kim', 'PhD Student', 'phd', 'Alex works on example problems.', 10);
  insert.run('Sam Lee', 'Undergraduate Researcher', 'undergrad', null, 20);
  console.log('Added sample people.');
}

if (isEmpty('publications')) {
  const insert = db.prepare('INSERT INTO publications (title, authors, venue, year, featured) VALUES (?, ?, ?, ?, ?)');
  insert.run('An Example Paper Title', 'A. Kim, J. Doe', 'Example Conference', 2026, 1);
  insert.run('Another Paper', 'S. Lee, A. Kim, J. Doe', 'Example Journal', 2025, 0);
  console.log('Added sample publications.');
}

if (isEmpty('news')) {
  db.prepare('INSERT INTO news (title, body, published_at) VALUES (?, ?, ?)').run(
    'Lab website launched',
    'Welcome to our new website!',
    new Date().toISOString().slice(0, 10),
  );
  console.log('Added sample news.');
}

if (isEmpty('resources')) {
  db.prepare('INSERT INTO resources (title, category, description) VALUES (?, ?, ?)').run(
    'New member onboarding',
    'Onboarding',
    'Replace with a link to your onboarding doc.',
  );
  console.log('Added sample resources.');
}
