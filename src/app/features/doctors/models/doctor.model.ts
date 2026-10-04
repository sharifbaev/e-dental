export type DoctorStatus = 'onShift' | 'offShift' | 'vacation';

export const DOCTOR_STATUSES: DoctorStatus[] = ['onShift', 'offShift', 'vacation'];

// Цвета статусов врача
export const DOCTOR_STATUS_CLASSES: Record<DoctorStatus, string> = {
  onShift: 'bg-emerald-50 text-emerald-700',
  offShift: 'bg-gray-100 text-gray-600',
  vacation: 'bg-amber-50 text-amber-700'
};

// TODO: получать справочник специальностей с API
export const SPECIALTIES = [
  'Терапевт', 'Гигиенист', 'Хирург', 'Ортодонт', 'Ортопед',
  'Детский стоматолог', 'Имплантолог', 'Пародонтолог', 'Эндодонтист', 'Рентгенолог'
];

export interface Doctor {
  id: number;
  fullName: string;
  phone: string;               // '+998 90 123-45-67'
  specialty: string;
  cabinet: number;
  experienceYears: number;
  workDays: number[];          // дни недели: 1 — пн … 7 — вс
  workStart: string;           // 'HH:mm'
  workEnd: string;             // 'HH:mm'
  patientsToday: number;
  status: DoctorStatus;
}

// Данные из формы врача (id и пациентов сегодня задаёт система)
export type DoctorDraft = Omit<Doctor, 'id' | 'patientsToday'>;
