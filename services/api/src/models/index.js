// All Mongoose models in one place.
// Collections:
//   users            – app accounts (login/signup in the main AgriQNet app)
//   farmers          – pest-alert recipients (one row per phone+district subscription)
//   districts, edges – Karnataka district graph used for BFS alert propagation
//   alerts, alertrecipients – outbreak reports + who was notified (zone + SMS status)
//   pests            – IP102 pest catalogue (classes of the YOLO model)
//   otps, smslogs, counters
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    location: { type: String, default: '' },
    districtId: { type: String, default: null },
    lang: { type: String, enum: ['en', 'hi', 'kn', 'te'], default: 'en' }, // preferred language (UI + SMS)
    role: { type: String, enum: ['farmer', 'officer'], default: 'farmer' },
    crops: [String], // crops the farmer grows (English keys, e.g. 'ragi') – personalises advice
    passwordHash: { type: String, required: true },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
UserSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    name: this.name,
    phone: this.phone,
    location: this.location,
    districtId: this.districtId,
    lang: this.lang,
    role: this.role,
    crops: this.crops || [],
  };
};

const FarmerSchema = new Schema(
  {
    id: { type: String, required: true, unique: true }, // "F12"
    name: { type: String, required: true },
    phone: { type: String, required: true },
    districtId: { type: String, required: true, index: true },
    userId: { type: String, default: null },
    lang: { type: String, enum: ['en', 'hi', 'kn', 'te'], default: 'kn' }, // SMS language
    source: { type: String, enum: ['seed', 'dashboard', 'app-signup', 'app-subscribe'], default: 'dashboard' },
    isDemo: { type: Boolean, default: false }, // demo farmers never receive real SMS
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
FarmerSchema.index({ phone: 1, districtId: 1 }, { unique: true });

const DistrictSchema = new Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  aliases: [String],
  meta: { population: Number, area_sq_km: Number },
  position: { x: Number, y: Number },
  geo: { lat: Number, lon: Number },
  majorCrops: [String],
});

const EdgeSchema = new Schema({ districtAId: String, districtBId: String });
EdgeSchema.index({ districtAId: 1, districtBId: 1 }, { unique: true });

const AlertSchema = new Schema(
  {
    id: { type: String, required: true, unique: true }, // "A7"
    reportedDistrictId: { type: String, required: true },
    severity: { type: String, enum: ['RED', 'ORANGE', 'YELLOW'], required: true },
    pestType: { type: String, required: true },
    // PENDING = farmer report waiting for an officer; REJECTED = officer said no
    status: { type: String, enum: ['PENDING', 'ACTIVE', 'CANCELLED', 'REJECTED'], default: 'ACTIVE' },
    reason: { type: String, default: null }, // why it was auto-approved / pending
    reviewedBy: { type: String, default: null },
    reportedAt: { type: Date, default: Date.now },
    source: { type: String, default: 'dashboard' }, // dashboard | app | seed
    detection: { model: String, confidence: Number },
    reportedBy: { type: String, default: null },
    stats: { red: Number, orange: Number, yellow: Number, smsSent: Number, smsSimulated: Number, smsFailed: Number },
  },
  { timestamps: true }
);

const AlertRecipientSchema = new Schema(
  {
    alertId: { type: String, index: true },
    farmerId: String,
    districtId: String,
    zone: { type: String, enum: ['RED', 'ORANGE', 'YELLOW'] },
    hops: Number,
    smsStatus: { type: String, enum: ['sent', 'simulated', 'failed', 'skipped'], default: 'skipped' },
  },
  { timestamps: true }
);

const PestSchema = new Schema({
  classId: { type: Number, unique: true },
  name: { type: String, required: true },
  crop: String,
  defaultSeverity: { type: String, enum: ['RED', 'ORANGE', 'YELLOW'], default: 'ORANGE' },
  description: String,
  management: [String],
});

const OtpSchema = new Schema({
  phone: { type: String, index: true },
  purpose: { type: String, default: 'signup' },
  codeHash: String,
  attempts: { type: Number, default: 0 },
  verifiedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
});
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 }); // purge 1h after expiry

const SmsLogSchema = new Schema(
  {
    to: String,
    body: String,
    status: { type: String, enum: ['sent', 'simulated', 'failed'] },
    provider: String,
    sid: String,
    error: String,
    context: String,
  },
  { timestamps: true }
);

// Daily district advice cache (saves AI quota): one row per district+crops+language+day
const AdviceSchema = new Schema({
  key: { type: String, unique: true },
  data: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
});

const CounterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });

export const User = model('User', UserSchema);
export const Farmer = model('Farmer', FarmerSchema);
export const District = model('District', DistrictSchema);
export const Edge = model('Edge', EdgeSchema);
export const Alert = model('Alert', AlertSchema);
export const AlertRecipient = model('AlertRecipient', AlertRecipientSchema);
export const Pest = model('Pest', PestSchema);
export const Otp = model('Otp', OtpSchema);
export const SmsLog = model('SmsLog', SmsLogSchema);
export const Counter = model('Counter', CounterSchema);
export const Advice = model('Advice', AdviceSchema);

/** Atomic, collision-free sequential IDs: nextId('farmer','F') -> "F42" */
export async function nextId(name, prefix) {
  const c = await Counter.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `${prefix}${c.seq}`;
}
