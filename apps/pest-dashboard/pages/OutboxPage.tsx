import React, { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { apiService } from '../services/apiService';

interface SmsEntry { _id: string; to: string; body: string; status: 'sent' | 'simulated' | 'failed'; provider: string; error?: string; context?: string; createdAt: string }

const BADGE: Record<string, string> = {
  sent: 'bg-green-100 text-green-800',
  simulated: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
};

/** Every SMS the platform tried to send (OTP, pest alerts, weather alerts) — real or simulated. */
const OutboxPage: React.FC = () => {
  const [log, setLog] = useState<SmsEntry[]>([]);
  const [status, setStatus] = useState<{ mode: string; twilioConfigured: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([apiService.getSmsLog(200), apiService.getSmsStatus()]);
      setLog(l);
      setStatus(s);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">SMS Outbox</h1>
        <button onClick={load} className="px-4 py-2 rounded-lg bg-brand-green text-white text-sm font-semibold">Refresh</button>
      </div>
      {status && (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Mode: <strong>{status.mode}</strong> · Twilio {status.twilioConfigured ? 'configured' : 'not configured (all SMS simulated)'} ·
          Synthetic seed farmers are always simulated.
        </p>
      )}
      <Card>
        {loading ? <p>Loading…</p> : log.length === 0 ? <p className="text-gray-500">No messages yet.</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b dark:border-gray-700">
                  <th className="py-2 pr-4">Time</th><th className="py-2 pr-4">To</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Context</th><th className="py-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {log.map(m => (
                  <tr key={m._id} className="border-b dark:border-gray-700 align-top">
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(m.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-4 font-mono whitespace-nowrap">{m.to}</td>
                    <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${BADGE[m.status]}`}>{m.status}</span></td>
                    <td className="py-2 pr-4 whitespace-nowrap text-gray-500">{m.context}</td>
                    <td className="py-2">{m.body}{m.error && <div className="text-xs text-red-500 mt-1">{m.error}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default OutboxPage;
