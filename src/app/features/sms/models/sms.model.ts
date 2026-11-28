// Отправленное SMS из журнала (GET /sms)
export type SmsStatus = 'sent' | 'failed';
export type SmsType = 'reminder' | 'birthday';

export interface SmsLogItem {
  id: number;
  createdAt: string;           // ISO — когда отправлено (или была попытка)
  type: SmsType;               // напоминание о визите или поздравление
  status: SmsStatus;
  error?: string | null;       // причина ошибки (для failed)
  patientId?: number | null;
  patientName: string;
  phone: string;               // '+998 90 123-45-67'
  text: string;                // итоговый текст, как ушёл пациенту
  appointmentId?: number | null;
  appointmentDate?: string | null; // 'YYYY-MM-DD' — для напоминаний
  appointmentTime?: string | null; // 'HH:mm'
}

// Фильтры списка
export interface SmsLogQuery {
  page: number;                // с 1
  size: number;
  q?: string;                  // имя или телефон пациента
  status?: SmsStatus;
  type?: SmsType;
}
