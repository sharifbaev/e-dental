export interface DoctorSlots {
  doctorId: number;
  doctorName: string;
  slots: string[];             // свободные окна врача на сегодня, 'HH:mm'
}

export interface DashboardSummary {
  clinicOpen: boolean;
  clinicLoad: number;          // загрузка клиники, %
  waitingList: number;         // в листе ожидания
  patientsToday: number;
  patientsTrend: number;       // изменение к прошлой неделе, %
  freeSlots: DoctorSlots[];    // свободные окна по врачам
  doctorsOnShift: number;
  doctorsTotal: number;
  revenueToday: number;        // сум
  revenueTrend: number;        // %
  revenuePlanPercent: number;  // выполнение дневного плана, %
}

export interface TodayPatient {
  id: number;
  time: string;                // 'HH:mm'
  fullName: string;
  service: string;
  doctorName: string;          // 'Савина А. И.'
  photoUrl?: string;           // фото пациента, если есть
}

export interface ShiftDoctor {
  id: number;
  name: string;                // 'Савина А. И.'
  specialty: string;
  onShift: boolean;
  shiftStart?: string;         // 'HH:mm', если на смене
  shiftEnd?: string;           // 'HH:mm', если на смене
  patientsToday: number;
  photoUrl?: string;           // фото врача, если есть
}

export type AppointmentStatus = 'confirmed' | 'pending' | 'arrived';

export interface Appointment {
  id: number;
  time: string;                // 'HH:mm'
  cabinet: number;
  patientName: string;
  service: string;
  status: AppointmentStatus;
  doctorId: number;
  doctorName: string;          // 'Сидоров А. П.'
  phone: string;               // '+998 90 123-45-67'
}
