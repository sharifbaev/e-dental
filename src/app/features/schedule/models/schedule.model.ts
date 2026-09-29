export type PatientStatus = 'primary' | 'inTreatment' | 'completed' | 'cancelled';

export interface ScheduleAppointment {
  id: number;
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
}

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
}

// Данные новой записи из формы (врач, дата и время пока подставляются автоматически)
export interface AppointmentDraft {
  patientId: number | null;    // null — новый пациент
  patientName: string;
  phone: string;
  serviceId: number;
  serviceName: string;
  durationMinutes: number;
}
