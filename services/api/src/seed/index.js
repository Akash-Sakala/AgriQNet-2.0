// Seeds MongoDB with districts, edges, farmers, pests, historical alerts and a demo user.
// - Called automatically by the API on startup when the DB is empty (AUTO_SEED=true).
// - CLI:  npm run seed            (from services/api)  -> wipes + reseeds
//         npm run seed  (root)    -> same, via the launcher
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { User, Farmer, District, Edge, Alert, AlertRecipient, Pest, Counter, Otp, SmsLog, Advice, nextId } from '../models/index.js';
import { reportAlert } from '../lib/alertEngine.js';
import * as data from './data.js';

/** Demo farmer + officer accounts (also run on every API start so older databases get them). */
export async function ensureAccounts() {
  for (const acc of [data.demoUser, data.demoUser2, data.demoOfficer]) {
    const { password, ...rest } = acc;
    await User.updateOne({ phone: rest.phone }, { $setOnInsert: { ...rest, passwordHash: await bcrypt.hash(password, 10) } }, { upsert: true });
    await User.updateOne({ phone: rest.phone, $or: [{ role: { $exists: false } }, { districtId: null }] }, { $set: { role: rest.role, districtId: rest.districtId, crops: rest.crops } });
  }
}

export async function isSeeded() {
  return (await District.estimatedDocumentCount()) > 0;
}

export async function seedDatabase({ reset = false, demo = false, log = console.log } = {}) {
  if (reset) {
    log('[seed] Clearing collections…');
    await Promise.all([User, Farmer, District, Edge, Alert, AlertRecipient, Pest, Counter, Otp, SmsLog, Advice].map((m) => m.deleteMany({})));
  }

  await District.insertMany(data.districts);
  await Edge.insertMany(data.edges);
  await Pest.insertMany(data.pests);
  await Farmer.insertMany(data.farmers);
  await Counter.findByIdAndUpdate('farmer', { seq: data.farmers.length }, { upsert: true });

  await ensureAccounts();

  // Historical alerts go through the real engine so recipients/zones are consistent.
  // Demo mode: no alerts at all, so a new report can be shown filling the map live.
  const ordered = demo ? [] : [...data.alerts].sort((a, b) => a.reportedAt - b.reportedAt);
  for (const a of ordered) {
    if (a.status === 'PENDING') {
      await Alert.create({
        id: await nextId('alert', 'A'), reportedDistrictId: a.districtId, severity: a.severity, pestType: a.pestType, status: 'PENDING',
        source: 'app', reason: 'needs_review', reportedAt: a.reportedAt, detection: { model: 'yolov8-ip102', confidence: a.confidence },
      });
      continue;
    }
    const res = await reportAlert({ ...a, notify: false, source: 'seed' });
    if (a.status === 'CANCELLED') await Alert.updateOne({ id: res.newAlert.id }, { status: 'CANCELLED' });
  }

  const counts = {
    districts: await District.countDocuments(),
    edges: await Edge.countDocuments(),
    farmers: await Farmer.countDocuments(),
    pests: await Pest.countDocuments(),
    alerts: await Alert.countDocuments(),
    alertRecipients: await AlertRecipient.countDocuments(),
    users: await User.countDocuments(),
  };
  log(`[seed] Done: ${JSON.stringify(counts)}`);
  return counts;
}

// CLI entry point
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reset = process.argv.includes('--reset');
  const demo = process.argv.includes('--demo');
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
    console.log(`[seed] Connected to ${config.mongoUri.replace(/\/\/[^@]*@/, '//<credentials>@')}`);
    if (!reset && (await isSeeded())) {
      console.log('[seed] Database already has data. Use --reset to wipe and reseed.');
    } else {
      await seedDatabase({ reset, demo });
      if (demo) console.log('[seed] Demo ready: 0 pest alerts. Report a pest from the app to see the map fill in.');
    }
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[seed] Failed:', err.message);
    console.error('       Is MongoDB running? Start the platform with `npm start` (it launches an embedded MongoDB).');
    process.exit(1);
  }
}
