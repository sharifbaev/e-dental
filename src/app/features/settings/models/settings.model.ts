// Данные клиники и настройки уведомлений
export interface ClinicSettings {
  name: string;
  phone: string;
  address: string;
  openTime: string;            // 'HH:mm'
  closeTime: string;           // 'HH:mm'
  timezone: string;            // 'Asia/Tashkent'
  currency: 'UZS' | 'USD';
  notifications: {
    sms24h: boolean;           // SMS за 24 часа до визита
    sms2h: boolean;            // SMS за 2 часа до визита
    doctorNewAppointment: boolean;
    dailyReport: boolean;
  };
}

export const DEFAULT_CLINIC_SETTINGS: ClinicSettings = {
  name: 'e-Dental',
  phone: '',
  address: '',
  openTime: '09:00',
  closeTime: '18:00',
  timezone: 'Asia/Tashkent',
  currency: 'UZS',
  notifications: {
    sms24h: true,
    sms2h: true,
    doctorNewAppointment: true,
    dailyReport: false
  }
};
