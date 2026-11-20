export type PatientMode = 'search' | 'new';
export type Gender = 'female' | 'male';

export interface PatientShort {
  id: number;
  fullName: string;
  phone: string;               // '+998 90 123-45-67'
  birthDate: string;           // 'YYYY-MM-DD'
}

export interface VisitService {
  id: number;
  name: string;
  durationMinutes: number;
  urgent?: boolean;            // срочный повод визита (например, острая боль)
  price?: number;              // цена, сум (справочник услуг в «Настройках»)
}
