// Unified pest-alert engine shared by the main AgriQNet app and the Pest Alert dashboard.
// report -> BFS over the district graph -> zone per recipient -> SMS (real or simulated) -> persisted.
import { Alert, AlertRecipient, Edge, Farmer, District, nextId } from '../models/index.js';
import { SeverityConfig, ZONE_BY_HOPS, bfsWithDistance } from './graph.js';
import { sendSms } from './sms.js';
import { tr, pestName, districtLabel } from './i18n.js';

// SMS text in each farmer's own language (pest + district names localised too).
function messageFor(zone, pestType, reportedId, districtId, lang, names) {
  return tr(lang, `sms_${zone}`, {
    pest: pestName(lang, pestType),
    district: districtLabel(lang, districtId, names[districtId]),
    reported: districtLabel(lang, reportedId, names[reportedId]),
  });
}

function validate({ districtId, severity, pestType }) {
  if (!SeverityConfig[severity]) throw Object.assign(new Error(`Invalid severity: ${severity}`), { status: 400 });
  if (!pestType) throw Object.assign(new Error('pestType is required'), { status: 400 });
  if (!districtId) throw Object.assign(new Error('districtId is required'), { status: 400 });
}

/**
 * BFS from the reported district -> zone per subscribed farmer -> SMS in each farmer's language.
 * Turns the alert ACTIVE and stores recipients + stats.
 */
async function broadcast(alertDoc, { notify = true } = {}) {
  const { id: alertId, reportedDistrictId: districtId, severity, pestType } = alertDoc;
  const edges = await Edge.find().lean();
  const hopsByDistrict = bfsWithDistance(districtId, edges, SeverityConfig[severity].propagationDepth);
  const districts = await District.find({ id: { $in: [...hopsByDistrict.keys()] } }).lean();
  const nameOf = Object.fromEntries(districts.map((d) => [d.id, d.name]));
  const farmers = await Farmer.find({ districtId: { $in: [...hopsByDistrict.keys()] }, active: true }).lean();

  const stats = { red: 0, orange: 0, yellow: 0, smsSent: 0, smsSimulated: 0, smsFailed: 0 };
  const recipientDocs = [];
  for (const f of farmers) {
    const hops = hopsByDistrict.get(f.districtId);
    const zone = ZONE_BY_HOPS[Math.min(hops, 2)];
    stats[zone.toLowerCase()] += 1;
    let smsStatus = 'skipped';
    if (notify) {
      const res = await sendSms({
        to: f.phone,
        body: messageFor(zone, pestType, districtId, f.districtId, f.lang || 'en', nameOf),
        context: `alert:${alertId}`,
        forceSimulate: f.isDemo, // never text the synthetic seed farmers
      });
      smsStatus = res.status;
      if (res.status === 'sent') stats.smsSent += 1;
      else if (res.status === 'simulated') stats.smsSimulated += 1;
      else stats.smsFailed += 1;
    }
    recipientDocs.push({ alertId, farmerId: f.id, districtId: f.districtId, zone, hops, smsStatus });
  }

  await AlertRecipient.deleteMany({ alertId });
  const recipients = recipientDocs.length ? await AlertRecipient.insertMany(recipientDocs) : [];
  const updated = await Alert.findOneAndUpdate({ id: alertId }, { status: 'ACTIVE', stats }, { new: true }).lean();

  return {
    newAlert: updated,
    recipients: recipients.map((r) => (r.toObject ? r.toObject() : r)),
    affectedDistricts: [...hopsByDistrict.entries()].map(([id, hops]) => ({ id, name: nameOf[id], hops, zone: ZONE_BY_HOPS[Math.min(hops, 2)] })),
    stats,
    summary: `Alert ${alertId} sent to ${farmers.length} farmers across ${hopsByDistrict.size} districts.`,
  };
}

/** Officer / seed path: create and broadcast immediately. */
export async function reportAlert({ districtId, severity, pestType, notify = true, source = 'dashboard', detection, reportedBy, reportedAt, reason }) {
  validate({ districtId, severity, pestType });
  if (!(await District.exists({ id: districtId }))) throw Object.assign(new Error(`Unknown district: ${districtId}`), { status: 400 });
  const alert = await Alert.create({
    id: await nextId('alert', 'A'), reportedDistrictId: districtId, severity, pestType, status: 'PENDING',
    source, detection, reportedBy, reason, reportedAt: reportedAt || new Date(),
  });
  return broadcast(alert.toObject(), { notify });
}

export const CONFIDENT = Number(process.env.AUTO_ALERT_CONFIDENCE || 0.6);
export const CORROBORATION_HOURS = 72;

/**
 * Farmer report rule ("auto if confident"):
 *  • photo AI confidence ≥ 60%  → broadcast now
 *  • or another report of the same pest in the same district in the last 72 h → broadcast now
 *  • otherwise → PENDING until an officer approves
 */
export async function submitFarmerReport({ districtId, severity, pestType, confidence, reportedBy, model }) {
  validate({ districtId, severity, pestType });
  if (!(await District.exists({ id: districtId }))) throw Object.assign(new Error(`Unknown district: ${districtId}`), { status: 400 });
  const since = new Date(Date.now() - CORROBORATION_HOURS * 3600e3);
  const earlier = await Alert.find({
    reportedDistrictId: districtId, pestType, reportedAt: { $gte: since }, status: { $in: ['PENDING', 'ACTIVE'] },
  }).lean();

  const alreadyActive = earlier.find((a) => a.status === 'ACTIVE');
  if (alreadyActive) {
    return { outcome: 'already_active', newAlert: alreadyActive, stats: alreadyActive.stats, affectedDistricts: [] };
  }

  const confident = typeof confidence === 'number' && confidence >= CONFIDENT;
  const corroborated = earlier.some((a) => a.status === 'PENDING' && a.reportedBy !== reportedBy) || (earlier.length > 0 && !reportedBy);
  const reason = confident ? 'confident' : corroborated ? 'corroborated' : 'needs_review';

  const alert = await Alert.create({
    id: await nextId('alert', 'A'), reportedDistrictId: districtId, severity, pestType, status: 'PENDING', source: 'app',
    detection: confidence !== undefined ? { model: model || 'yolov8-ip102', confidence } : undefined,
    reportedBy, reason, reportedAt: new Date(),
  });

  if (reason === 'needs_review') return { outcome: 'pending', newAlert: alert.toObject(), stats: null, affectedDistricts: [] };

  // corroborating reports are folded into this broadcast
  await Alert.updateMany({ id: { $in: earlier.map((a) => a.id) }, status: 'PENDING' }, { status: 'REJECTED', reason: `merged into ${alert.id}` });
  return { outcome: 'sent', ...(await broadcast(alert.toObject())) };
}

/** Officer approves a pending report. */
export async function approveAlert(alertId, officerId, severity) {
  const a = await Alert.findOne({ id: alertId, status: 'PENDING' }).lean();
  if (!a) throw Object.assign(new Error('Pending alert not found'), { status: 404 });
  if (severity && SeverityConfig[severity]) await Alert.updateOne({ id: alertId }, { severity });
  await Alert.updateOne({ id: alertId }, { reviewedBy: officerId, reason: 'approved' });
  return broadcast({ ...a, severity: severity || a.severity });
}

/** When a farmer joins, attach them to every ACTIVE alert whose spread covers their district. */
export async function applyActiveAlertsToFarmer(farmer) {
  const activeAlerts = await Alert.find({ status: 'ACTIVE' }).lean();
  if (!activeAlerts.length) return [];
  const edges = await Edge.find().lean();
  const docs = [];
  for (const a of activeAlerts) {
    const hops = bfsWithDistance(a.reportedDistrictId, edges, SeverityConfig[a.severity].propagationDepth).get(farmer.districtId);
    if (hops !== undefined) {
      docs.push({ alertId: a.id, farmerId: farmer.id, districtId: farmer.districtId, zone: ZONE_BY_HOPS[Math.min(hops, 2)], hops, smsStatus: 'skipped' });
    }
  }
  if (docs.length) await AlertRecipient.insertMany(docs);
  return docs;
}
