import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'secret-pass';

const { connectDb, seedAdmin } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');

let mongod, server, base, token;
const pdf = Buffer.from('%PDF-1.4\n% test diploma ' + Date.now() + '\n%%EOF');
const hash = crypto.createHash('sha256').update(pdf).digest('hex');

before(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri('diplomes'));
  await seedAdmin();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server.close();
  await mongoose.disconnect();
  await mongod.stop();
});

const form = (file, extra = {}) => {
  const fd = new FormData();
  fd.append('nom', 'Ben Salah');
  fd.append('prenom', 'Amine');
  fd.append('filiere', 'Licence en Informatique');
  fd.append('annee', '2025');
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  if (file) fd.append('file', new Blob([file], { type: 'application/pdf' }), 'diplome.pdf');
  return fd;
};
const auth = () => ({ Authorization: `Bearer ${token}` });

test('health is ok', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
});

test('login rejects bad password and accepts the right one', async () => {
  const bad = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@test.local', password: 'nope' }) });
  assert.equal(bad.status, 401);
  const ok = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ADMIN@test.local', password: 'secret-pass' }) });
  assert.equal(ok.status, 200);
  token = (await ok.json()).token;
  assert.ok(token);
});

test('admin routes require a token', async () => {
  assert.equal((await fetch(`${base}/diplomas`)).status, 401);
  assert.equal((await fetch(`${base}/diplomas`, { method: 'POST', body: form(pdf) })).status, 401);
});

test('unknown hash is reported unknown', async () => {
  const r = await fetch(`${base}/verify/${hash}`);
  assert.deepEqual(await r.json(), { status: 'unknown' });
  assert.equal((await fetch(`${base}/verify/xyz`)).status, 400);
});

test('issuing rejects non-PDF and missing fields', async () => {
  const notPdf = await fetch(`${base}/diplomas`, { method: 'POST', headers: auth(), body: form(Buffer.from('hello world')) });
  assert.equal(notPdf.status, 400);
  const missing = await fetch(`${base}/diplomas`, { method: 'POST', headers: auth(), body: form(pdf, { nom: '' }) });
  assert.equal(missing.status, 400);
});

test('issue -> verify valid -> download -> duplicate -> revoke -> verify revoked', async () => {
  const created = await fetch(`${base}/diplomas`, { method: 'POST', headers: auth(), body: form(pdf) });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).hash, hash); // server-side hash == local hash

  const v = await (await fetch(`${base}/verify/${hash}`)).json();
  assert.equal(v.status, 'valid');
  assert.equal(v.diploma.prenom, 'Amine');
  assert.equal(v.diploma.issuedBy, undefined); // not leaked publicly

  const file = await fetch(`${base}${v.diploma.fileUrl.replace('/api', '')}`);
  assert.equal(file.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), pdf); // stored byte for byte

  const dup = await fetch(`${base}/diplomas`, { method: 'POST', headers: auth(), body: form(pdf) });
  assert.equal(dup.status, 409);

  const list = await (await fetch(`${base}/diplomas`, { headers: auth() })).json();
  assert.equal(list.length, 1);

  const rev = await fetch(`${base}/diplomas/${hash}/revoke`, { method: 'POST', headers: auth() });
  assert.equal(rev.status, 200);
  assert.equal((await fetch(`${base}/diplomas/${hash}/revoke`, { method: 'POST', headers: auth() })).status, 409);
  assert.equal((await (await fetch(`${base}/verify/${hash}`)).json()).status, 'revoked');

  // one flipped byte = no match
  const tampered = Buffer.concat([pdf, Buffer.from(' ')]);
  const th = crypto.createHash('sha256').update(tampered).digest('hex');
  assert.equal((await (await fetch(`${base}/verify/${th}`)).json()).status, 'unknown');
});
