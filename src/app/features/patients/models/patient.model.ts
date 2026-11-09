import { PatientStatus } from '../../../shared/models/patient-status';
import { PatientRating } from '../../../shared/models/patient-rating';

export type Gender = 'female' | 'male';
export type DiagnosisStatus = 'active' | 'resolved';

export interface Diagnosis {
  id: number;
  title: string;
  date: string;                // 'YYYY-MM-DD'
  tooth?: number;              // номер зуба по международной схеме, например 36
  doctorName: string;
  description: string;         // описание и проведённое лечение
  status: DiagnosisStatus;
}

export interface Patient {
  id: number;
  fullName: string;
  phone: string;               // '+998 90 123-45-67'
  birthDate: string;           // 'YYYY-MM-DD'
  gender: Gender;
  status: PatientStatus;
  doctorName: string;          // лечащий врач, 'Савина А. И.'
  lastVisit?: string;          // 'YYYY-MM-DD'
  nextVisit?: string;          // 'YYYY-MM-DD'
  nextVisitTime?: string;      // 'HH:mm'
  diagnoses: Diagnosis[];      // история, новые сверху
  rating?: PatientRating;      // рейтинг пациента; нет — считаем «надёжный»
}
