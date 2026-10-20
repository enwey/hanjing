import { test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import express from 'express';
import jwt from 'jsonwebtoken';
import { initPatientProfileSchema } from '../patient-profile-schema.js';

test('merged family profile workflow keeps account and upload boundaries', async t => {
  const port = Number(process.env.TEST_DB_PORT || 3306);
  const user = process.env.TEST_DB_USER || 'root';
  const password = process.env.TEST_DB_PASSWORD || 'root';
  const schema = 'hanjing_test_family_' + Date.now();
  const control = await mysql.createConnection({ host: '127.0.0.1', port, user, password });
  let db, server;
  await control.query('CREATE DATABASE ' + schema);
  try {
    Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_USER: user, DB_PASSWORD: password, DB_NAME: schema });
    db = await import('../db.js');
    await db.initDB();
    const helpers = await import('../helpers.js');
    const client = await import('../routes/client.js');
    await db.run("INSERT INTO users(id,openid,nickname) VALUES(1,'FAMILY-1','Owner'),(2,'FAMILY-2','Other')");
    await db.run("INSERT INTO stores(id,name,code,address,status) VALUES(1,'Clinic one','FAM-1','Address','open'),(2,'Closed clinic','FAM-2','Address','closed')");
    await db.run("INSERT INTO private_uploads(file_path,user_id) VALUES('/uploads/medical-attachments/family.jpg',1),('/uploads/medical-attachments/other.jpg',2)");
    const token = jwt.sign({ id: 1, openid: 'FAMILY-1' }, helpers.JWT_SECRET);
    const otherToken = jwt.sign({ id: 2, openid: 'FAMILY-2' }, helpers.JWT_SECRET);
    const app = express();
    app.use(express.json(), client.default);
    app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const api = async (path, body, method = body === undefined ? 'GET' : 'POST', auth = token) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method, headers: { authorization: 'Bearer ' + auth, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
      });
      return { status: response.status, body: await response.json() };
    };
    const base = '/api/v1/user/family-members';
    const payload = { name: 'Child fixture', relation: 'child', gender: '1', phone: '13800138001',
      birthday: '2015-06-01', storeId: '1', region: 'Test region', address: 'Test address',
      avatarUrl: '/uploads/medical-attachments/family.jpg?asset_token=discard-on-save' };
    let id;

    await t.test('create, list and detail persist extended profile with fresh signed avatars', async () => {
      const result = await api(base, payload);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      id = result.body.data.id;
      const saved = await db.get('SELECT * FROM patients WHERE id=?', [id]);
      assert.equal(saved.user_id, 1);
      assert.equal(saved.avatar_url, '/uploads/medical-attachments/family.jpg');
      for (const member of [(await api(base)).body.data.list[0], (await api(base + '/' + id)).body.data]) {
        assert.equal(member.storeId, '1');
        assert.equal(member.storeName, 'Clinic one');
        assert.equal(member.birthday, payload.birthday);
        assert.equal(member.region, payload.region);
        assert.equal(member.address, payload.address);
        assert.match(member.avatarUrl, /\?asset_token=/);
      }
    });
    await t.test('edits save the new fields without changing account ownership', async () => {
      const result = await api(base + '/' + id, { ...payload, birthday: '2014-06-01', address: 'Updated address' }, 'PUT');
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.data.address, 'Updated address');
      assert.equal(result.body.data.birthday, '2014-06-01');
      assert.equal((await db.get('SELECT user_id FROM patients WHERE id=?', [id])).user_id, 1);
    });
    await t.test('legacy edit payloads preserve fields they do not send', async () => {
      const result = await api(base + '/' + id, { name: 'Legacy edit', relation: 'child', gender: '1', phone: payload.phone }, 'PUT');
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.data.birthday, '2014-06-01');
      assert.equal(result.body.data.address, 'Updated address');
      assert.equal(result.body.data.storeId, '1');
    });
    await t.test('invalid calendar dates and store IDs are rejected by the API', async () => {
      for (const changes of [{ birthday: '2015-02-30' }, { birthday: '2999-01-01' }, { birthday: '2015-01-01junk' },
        { storeId: '1junk' }, { storeId: true }, { storeId: 9999 }, { storeId: 2 }, { region: 'x'.repeat(121) }]) {
        const result = await api(base, { ...payload, ...changes });
        assert.equal(result.status, 400, JSON.stringify(changes));
      }
    });
    await t.test('temporary or foreign avatars cannot be saved', async () => {
      assert.equal((await api(base, { ...payload, avatarUrl: 'wxfile://temporary.jpg' })).status, 400);
      assert.equal((await api(base, { ...payload, avatarUrl: '/uploads/medical-attachments/other.jpg' })).status, 403);
    });
    await t.test('legacy cross-account links do not expose new fields or permit edits', async () => {
      await db.run("INSERT INTO patients(id,user_id,name,relation,patient_no,phone) VALUES(900,2,'Other patient','child','FAMILY-OTHER',?)", [helpers.encryptPII('13800138002')]);
      await db.run("INSERT INTO user_patient_links(user_id,patient_id,relation) VALUES(1,900,'other'),(2,900,'child')");
      const list = (await api(base)).body.data.list;
      assert.equal(list.some(member => member.id === '900'), false);
      assert.equal((await api(base + '/900')).status, 404);
      assert.equal((await api(base + '/900', { ...payload, avatarUrl: '' }, 'PUT')).status, 404);
      assert.equal((await api(base + '/' + id, undefined, 'GET', otherToken)).status, 404);
      const result = await api(base, { ...payload, name: 'Same phone, isolated profile', phone: '13800138002', avatarUrl: '' });
      assert.equal(result.status, 200);
      assert.notEqual(result.body.data.id, '900');
    });
    await t.test('migration upgrades an old patients table and is repeatable without losing rows', async () => {
      const before = await db.query('SELECT * FROM patients ORDER BY id');
      await initPatientProfileSchema(db.query);
      assert.deepEqual(await db.query('SELECT * FROM patients ORDER BY id'), before);
      await control.query('USE ' + schema);
      await control.query('CREATE TABLE legacy_patients(id INT PRIMARY KEY, name VARCHAR(40))');
      await control.query("INSERT INTO legacy_patients VALUES(1,'Keep this row')");
      const legacyQuery = async (sql, params) => (await control.query(sql.replace(/\bpatients\b/g, 'legacy_patients'), params))[0];
      await initPatientProfileSchema(legacyQuery);
      await initPatientProfileSchema(legacyQuery);
      const [[row]] = await control.query('SELECT * FROM legacy_patients');
      assert.equal(row.name, 'Keep this row');
      for (const column of ['avatar_url', 'birthday', 'store_id', 'region', 'address']) assert.equal(row[column], null);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.closePool();
    await control.query('DROP DATABASE ' + schema);
    await control.end();
  }
});
