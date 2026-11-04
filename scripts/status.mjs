// npm run status — prints the health of every AgriQNet service (via the API gateway).
const port = process.env.API_PORT || 5000;
try {
  const r = await fetch(`http://127.0.0.1:${port}/api/health`);
  const h = await r.json();
  const ok = (b) => (b ? '\x1b[32mup\x1b[0m' : '\x1b[31mdown\x1b[0m');
  console.log(`API gateway        ${ok(h.api === 'up')}`);
  console.log(`MongoDB            ${h.mongo}`);
  for (const [k, v] of Object.entries(h.services)) console.log(`${k.padEnd(19)}${ok(v.up)}${v.error ? `  (${v.error})` : ''}`);
  console.log(`Gemini             ${h.gemini.configured ? h.gemini.model : 'not configured'}`);
  console.log(`SMS                ${h.sms.mode}${h.sms.twilioConfigured ? ' (Twilio configured)' : ' (simulated)'}`);
} catch (e) {
  console.log(`\x1b[31mAgriQNet API is not reachable on port ${port}\x1b[0m — start the platform with \`npm start\`.`);
  process.exitCode = 1;
}
