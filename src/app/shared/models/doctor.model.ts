export type DoctorStatus = 'onShift' | 'offShift' | 'vacation';

export const DOCTOR_STATUSES: DoctorStatus[] = ['onShift', 'offShift', 'vacation'];

// Цвета статусов врача (светлая и тёмная тема)
export const DOCTOR_STATUS_CLASSES: Record<DoctorStatus, string> = {
  onShift: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  offShift: 'bg-page text-soft dark:bg-white/10 dark:text-gray-300',
  vacation: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
};

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
  serviceIds?: number[];       // услуги врача (справочник услуг; 0 — «Другое»)
  otherService?: string;       // своя услуга, если выбрано «Другое»
}
