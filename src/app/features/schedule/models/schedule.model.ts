// Статус пациента — общий для всего приложения (реэкспорт, чтобы старые импорты продолжали работать)
export type { PatientStatus } from '../../../shared/models/patient-status';
import type { PatientStatus } from '../../../shared/models/patient-status';
import type { PatientRating } from '../../../shared/models/patient-rating';

// Как пациент подтвердил запись: ответил на SMS или по звонку
export type AppointmentConfirmation = 'sms' | 'call';

export interface ScheduleAppointment {
  id: number;
  date: string;                // 'YYYY-MM-DD'
  start: string;               // 'HH:mm'
  end: string;                 // 'HH:mm'
  cabinet: number;
  patientId: number;
  patientName: string;
  phone: string;
  serviceId: number;            // первая из serviceIds (для совместимости)
  serviceIds?: number[];       // все услуги приёма; 0 — «Другое»
  service: string;             // названия услуг через запятую
  otherReason?: string;        // повод своими словами, если выбрано «Другое»
  urgent?: boolean;            // срочный повод (острая боль)
  doctorId: number;
  doctorName: string;          // 'Савина А. И.'
  status: PatientStatus;
  patientRating?: PatientRating;  // рейтинг пациента — цветной квадратик в карточке
  confirmation?: AppointmentConfirmation;  // нет — запись не подтверждена
  planId?: number;             // план лечения, к которому относится визит
  visitIndex?: number;         // номер визита в серии плана (с 1)
  visitTotal?: number;         // всего визитов в серии
  paymentState?: 'paid' | 'debt';  // считает сервер по оплатам; нет — оплаты не было
  statusOverdue?: boolean;     // сервер: статус «Первичный» не сменили через 30 мин после конца
}

// Данные новой записи из формы
export interface AppointmentDraft {
  patientId: number | null;    // null — новый пациент
  patientName: string;
  phone: string;
  serviceId: number;
  serviceName: string;
  durationMinutes: number;
  time?: string;               // 'HH:mm' — время из формы
  rating?: PatientRating;       // рейтинг пациента из формы
  serviceIds?: number[];       // все выбранные услуги
  otherReason?: string;        // повод визита, если выбрано «Другое»
  birthDate?: string;          // 'YYYY-MM-DD' — новый пациент
  gender?: 'female' | 'male';  // новый пациент
  cabinet?: number;
}

// Приём в ответе сервера (GET /appointments и др.)
export type AppointmentDto = Omit<ScheduleAppointment, 'serviceId'> & { serviceIds: number[] };

// Ответ сервера → приём для экранов: serviceId — первая услуга
export function fromAppointmentDto(dto: AppointmentDto): ScheduleAppointment {
  const ids = dto.serviceIds ?? [];
  return { ...dto, serviceIds: ids, serviceId: ids.find(id => id !== 0) ?? ids[0] ?? 0 };
}
