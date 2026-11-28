// Единица времени для напоминаний: «за 9 часов», «за 30 минут», «за 1 день»
export type OffsetUnit = 'minutes' | 'hours' | 'days';

// Язык SMS пациентам
export type SmsLanguage = 'ru' | 'uz';

// Проверка текста SMS у SMS-провайдера (только чтение, ставит сервер)
export type SmsModerationStatus = 'pending' | 'approved' | 'rejected';
export interface SmsModeration {
  status: SmsModerationStatus;
  comment?: string | null;     // причина отказа (для rejected)
}

// Одно SMS-напоминание пациенту: за сколько до визита и текст.
// В тексте сервер подставляет {patient}, {date}, {time}, {doctor}
export interface SmsReminder {
  value: number;
  unit: OffsetUnit;
  text: string;
  moderation?: SmsModeration | null;
}

// Данные клиники и настройки уведомлений
export interface ClinicSettings {
  name: string;
  phone: string;
  address: string;
  openTime: string;            // 'HH:mm'
  closeTime: string;           // 'HH:mm'
  timezone: string;            // 'Asia/Tashkent'
  currency: 'UZS' | 'USD';
  logoUrl: string | null;      // свой логотип клиники; null — стандартный
  notifications: {
    sms24h: boolean;           // устаревшее: SMS за 24 часа до визита (заменено patientSms)
    sms2h: boolean;            // устаревшее: SMS за 2 часа до визита (заменено patientSms)
    doctorNewAppointment: boolean;
    dailyReport: boolean;
    smsLanguage: SmsLanguage;  // язык SMS пациентам
    // SMS-напоминания пациенту перед визитом (можно несколько)
    patientSms: {
      enabled: boolean;
      reminders: SmsReminder[];
    };
    // SMS-поздравление с днём рождения
    birthdaySms: {
      enabled: boolean;
      time: string;            // 'HH:mm' — во сколько отправлять в день рождения
      text: string;
      moderation?: SmsModeration | null;
    };
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
  logoUrl: null,
  notifications: {
    sms24h: true,
    sms2h: true,
    doctorNewAppointment: true,
    dailyReport: false,
    smsLanguage: 'ru',
    patientSms: { enabled: false, reminders: [] },
    birthdaySms: { enabled: false, time: '10:00', text: '' }
  }
};

// ---- Примерные тексты SMS (врач может оставить или написать свой) ----

// Название и телефон клиники подставляются в текст сразу (из вкладки «Клиника»),
// а {patient}, {date}, {time} — сервер при отправке
export function reminderTemplate(lang: SmsLanguage, clinic: string, phone: string): string {
  const name = clinic.trim() || 'e-Dental';
  const tel = phone.trim() ? ` ${phone.trim()}` : '';
  return lang === 'uz'
    ? `Assalomu alaykum, {patient}! «${name}» klinikasida {date} kuni soat {time} da qabulingiz borligini eslatamiz.${tel ? ` Rejangiz o'zgarsa, qo'ng'iroq qiling:${tel}` : ''}`
    : `Здравствуйте, {patient}! Напоминаем о приёме в клинике «${name}» {date} в {time}.${tel ? ` Если планы изменились, позвоните нам:${tel}` : ''}`;
}

export function birthdayTemplate(lang: SmsLanguage, clinic: string): string {
  const name = clinic.trim() || 'e-Dental';
  return lang === 'uz'
    ? `{patient}, «${name}» klinikasi sizni tug'ilgan kuningiz bilan chin dildan tabriklaydi! Mustahkam sog'liq va doimo chiroyli tabassum tilaymiz.`
    : `{patient}, клиника «${name}» от всей души поздравляет вас с днём рождения! Желаем крепкого здоровья и красивой улыбки.`;
}

// ---- Личные настройки пользователя (GET/PUT /me/preferences) ----

// Напоминание врачу обновить статус приёма: через сколько после приёма
export interface StatusReminder {
  enabled: boolean;
  value: number;
  unit: OffsetUnit;
}

// Масштаб интерфейса
export type UiScale = 'compact' | 'normal' | 'large';

export const DEFAULT_STATUS_REMINDERS: { primary: StatusReminder; awaitingDecision: StatusReminder } = {
  primary: { enabled: true, value: 30, unit: 'minutes' },
  awaitingDecision: { enabled: true, value: 1, unit: 'days' }
};
