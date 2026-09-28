import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { PatientShort, VisitService } from '../models/appointment-form.model';

// Mock-база пациентов
const PATIENTS: PatientShort[] = [
  { id: 1, fullName: 'Ковалёв Максим Дмитриевич', phone: '+998 93 555-12-34', birthDate: '1990-04-12' },
  { id: 2, fullName: 'Смирнов Артур Павлович', phone: '+998 90 123-45-67', birthDate: '1985-11-03' },
  { id: 3, fullName: 'Михайлова Дарья Игоревна', phone: '+998 97 700-11-22', birthDate: '1998-02-27' },
  { id: 4, fullName: 'Абдуллаева Нилуфар Рустамовна', phone: '+998 99 321-65-87', birthDate: '1992-06-14' },
  { id: 5, fullName: 'Турсунов Жасур Алишерович', phone: '+998 91 444-78-90', birthDate: '1979-09-30' },
  { id: 6, fullName: 'Петров Сергей Олегович', phone: '+998 94 222-33-44', birthDate: '2001-01-08' }
];

@Injectable({ providedIn: 'root' })
export class AppointmentFormService {
  // TODO: заменить на реальный запрос, когда будет API:
  // return this.http.get<PatientShort[]>(`${apiUrl}/patients/search`, { params: { q: query } });
  searchPatients(query: string): Observable<PatientShort[]> {
    const text = query.trim().toLowerCase();
    const digits = query.replace(/\D/g, '');

    const result = PATIENTS.filter(patient =>
      patient.fullName.toLowerCase().includes(text) ||
      (digits.length >= 2 && patient.phone.replace(/\D/g, '').includes(digits))
    );

    return of(result).pipe(delay(300));
  }

  // TODO: заменить на реальный запрос, когда будет API:
  // return this.http.get<VisitService[]>(`${apiUrl}/services`);
  getVisitServices(): Observable<VisitService[]> {
    return of<VisitService[]>([
      { id: 1, name: 'Лечение кариеса', durationMinutes: 45 },
      { id: 2, name: 'Профессиональная гигиена AirFlow', durationMinutes: 60 },
      { id: 3, name: 'Консультация и осмотр', durationMinutes: 30 },
      { id: 4, name: 'Удаление зуба', durationMinutes: 40 },
      { id: 5, name: 'Острая боль', durationMinutes: 30, urgent: true }
    ]).pipe(delay(300));
  }
}
