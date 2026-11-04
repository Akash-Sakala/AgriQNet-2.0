import axios from "axios";

// Relative URL: Vite proxies /api -> AgriQNet API (see vite.config.ts)
const API = "/api";

export const apiService = {
  // GET DATA
  getDistricts: () => axios.get(`${API}/districts`).then(r => r.data),
  getEdges: () => axios.get(`${API}/districts/edges`).then(r => r.data),
  getFarmers: () => axios.get(`${API}/farmers`).then(r => r.data),
  getAlerts: () => axios.get(`${API}/alerts`).then(r => r.data),
  getAlertRecipients: () => axios.get(`${API}/recipients`).then(r => r.data),
  getSmsLog: (limit = 100) => axios.get(`${API}/sms/log?limit=${limit}`).then(r => r.data),
  getSmsStatus: () => axios.get(`${API}/sms/status`).then(r => r.data),

  // ACTIONS
  reportAlert: (districtId: string, severity: string, pestType: string) =>
    axios.post(`${API}/alerts`, { districtId, severity, pestType, source: 'dashboard' }).then(r => r.data),

  cancelAlert: (id: string) =>
    axios.put(`${API}/alerts/${id}/cancel`).then(r => r.data),

  addFarmer: (farmer: any) =>
    axios.post(`${API}/farmers`, farmer).then(r => r.data),

  /** YOLOv8 (IP102) detection via the API gateway */
  detectPest: async (imageFile: File) => {
    const form = new FormData();
    form.append("image", imageFile);
    const res = await axios.post(`${API}/pest/detect`, form);
    return res.data;
  }
};
