import { api } from "./config";

export interface OtpSendResult {
  success: boolean;
  /** true when SMS is simulated (no Twilio creds / trial-account restriction) */
  isMock?: boolean;
  /** only present in simulation mode, so the UI can show the code */
  otp?: string;
  error?: string;
}

/** OTP + SMS via the AgriQNet API (Twilio on the server, or simulation). */
export const TwilioService = {
  async sendOTP(phone: string, message?: string, purpose: 'signup' | 'subscribe' = 'signup', lang = 'en'): Promise<OtpSendResult> {
    try {
      const r = await api<{ success: boolean; isMock: boolean; devOtp?: string }>('/otp/send', {
        method: 'POST',
        json: { phone, message, purpose, lang },
      });
      return { success: r.success, isMock: r.isMock, otp: r.devOtp };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async verifyOTP(phone: string, otp: string, purpose: 'signup' | 'subscribe' = 'signup'): Promise<boolean> {
    try {
      const r = await api<{ success: boolean }>('/otp/verify', { method: 'POST', json: { phone, otp, purpose } });
      return r.success;
    } catch {
      return false;
    }
  },

  async sendSms(to: string, body: string): Promise<{ success: boolean; isMock: boolean }> {
    try {
      const r = await api<{ success: boolean; isMock: boolean }>('/sms/send', { method: 'POST', json: { to, body } });
      return { success: r.success, isMock: r.isMock };
    } catch {
      return { success: false, isMock: false };
    }
  },
};
