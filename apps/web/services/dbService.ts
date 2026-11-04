import { Farmer } from "../types";
import { api } from "./config";

const CACHE_KEY = "agriqnet_current_farmer";

/**
 * Accounts + pest-alert subscriptions, backed by MongoDB through the AgriQNet API.
 * (The old localStorage fallback silently stored sign-ups in the browser, which is why
 *  MongoDB looked empty — it has been removed so failures are visible.)
 */
export const DBService = {
  async findUserByPhone(phone: string): Promise<{ phone: string } | null> {
    const data = await api<{ exists: boolean }>('/auth/check-user', { method: 'POST', json: { phone } });
    return data.exists ? { phone } : null;
  },

  /** Requires the phone to have been OTP-verified (purpose "signup") first. */
  async createUser(farmer: Farmer & { crops?: string[] }): Promise<Farmer> {
    const data = await api<{ user: Farmer; token: string }>('/auth/register', { method: 'POST', json: farmer });
    const user = { ...data.user, token: data.token };
    this.cacheUser(user);
    return user;
  },

  /** Change language / district / crops of the logged-in farmer (server keeps SMS alerts in sync). */
  async updateProfile(changes: { lang?: string; districtId?: string; crops?: string[]; name?: string }): Promise<Farmer> {
    const data = await api<{ user: Farmer }>('/auth/profile', { method: 'PUT', json: changes });
    const user = { ...data.user, token: this.getCachedUser()?.token };
    this.cacheUser(user);
    return user;
  },

  async verifyLogin(phone: string, password: string): Promise<Farmer | null> {
    try {
      const data = await api<{ success: boolean; user: Farmer; token: string }>('/auth/login', { method: 'POST', json: { phone, password } });
      if (data.success && data.user) {
        const user = { ...data.user, token: data.token };
        this.cacheUser(user);
        return user;
      }
      return null;
    } catch (e: any) {
      if (e.status === 404 || e.status === 401) return null;
      throw e;
    }
  },

  cacheUser(user: Farmer) {
    const { password, ...safe } = user as any;
    localStorage.setItem(CACHE_KEY, JSON.stringify(safe));
  },

  getCachedUser(): Farmer | null {
    try {
      const data = localStorage.getItem(CACHE_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  logout() {
    localStorage.removeItem(CACHE_KEY);
  },

  /** Subscribe a (verified) phone number to pest alerts for a district id, e.g. "MYS". */
  async addPestSubscriber(districtId: string, phone: string, name?: string, lang = 'en'): Promise<{ district: { id: string; name: string } }> {
    return api('/subscriptions', { method: 'POST', json: { districtId, phone, name, lang } });
  },
};
