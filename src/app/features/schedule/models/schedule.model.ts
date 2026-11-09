// Статус пациента — общий для всего приложения (реэкспорт, чтобы старые импорты продолжали работать)
export type { PatientStatus } from '../../../shared/models/patient-status';
import type { PatientStatus } from '../../../shared/models/patient-status';
import type { PatientRating } from '../../../shared/models/patient-rating';

export interface ScheduleAppointment {
  id: number;
  date: string;                // 'YYYY-MM-DD'
  start: string;               // 'HH:mm'
  end: string;                 // 'HH:mm'
  cabinet: number;
  patientId: number;
  patientName: string;
  phone: string;
  serviceId: number;
  service: string;
  doctorId: number;
  doctorName: string;          // 'Савина А. И.'
  status: PatientStatus;
  patientRating?: PatientRating;  // рейтинг пациента — цветной квадратик в карточке
}

// Данные новой записи из формы (врач, дата и время пока подставляются автоматически)
export interface AppointmentDraft {
  patientId: number | null;    // null — новый пациент
  patientName: string;
  phone: string;
  serviceId: number;
  serviceName: string;
  durationMinutes: number;
  time?: string;               // 'HH:mm' — время из формы
  rating?: PatientRating;       // рейтинг пациента из формы
}
