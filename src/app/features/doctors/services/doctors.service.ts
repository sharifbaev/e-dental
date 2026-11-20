import { Injectable, signal } from '@angular/core';
import { Observable, delay, map, of, tap } from 'rxjs';
import { Doctor, DoctorDraft } from '../models/doctor.model';

// Mock: 14 врачей
const DOCTORS: Doctor[] = [
  { id: 1, fullName: 'Сидоров Андрей Петрович', phone: '+998 90 210-11-01', specialty: 'Терапевт', cabinet: 1, experienceYears: 12, workDays: [1, 2, 3, 4, 5], workStart: '09:00', workEnd: '18:00', patientsToday: 6, status: 'onShift' },
  { id: 2, fullName: 'Каримова Дильноза Рустамовна', phone: '+998 91 220-22-02', specialty: 'Гигиенист', cabinet: 2, experienceYears: 7, workDays: [1, 2, 3, 4, 5], workStart: '09:00', workEnd: '17:00', patientsToday: 5, status: 'onShift' },
  { id: 3, fullName: 'Юсупов Бахтиёр Тимурович', phone: '+998 93 230-33-03', specialty: 'Хирург', cabinet: 3, experienceYears: 15, workDays: [1, 3, 5], workStart: '10:00', workEnd: '19:00', patientsToday: 4, status: 'onShift' },
  { id: 4, fullName: 'Савина Анна Игоревна', phone: '+998 94 240-44-04', specialty: 'Терапевт', cabinet: 2, experienceYears: 9, workDays: [2, 3, 4, 5, 6], workStart: '08:00', workEnd: '16:00', patientsToday: 5, status: 'onShift' },
  { id: 5, fullName: 'Рахимов Шерзод Камолович', phone: '+998 95 250-55-05', specialty: 'Ортодонт', cabinet: 4, experienceYears: 11, workDays: [1, 2, 4, 6], workStart: '12:00', workEnd: '20:00', patientsToday: 4, status: 'onShift' },
  { id: 6, fullName: 'Ким Евгений Валерьевич', phone: '+998 97 260-66-06', specialty: 'Ортопед', cabinet: 5, experienceYears: 18, workDays: [2, 4], workStart: '09:00', workEnd: '15:00', patientsToday: 0, status: 'offShift' },
  { id: 7, fullName: 'Назарова Мадина Сергеевна', phone: '+998 99 270-77-07', specialty: 'Детский стоматолог', cabinet: 6, experienceYears: 6, workDays: [1, 2, 3, 4, 5], workStart: '09:00', workEnd: '14:00', patientsToday: 0, status: 'vacation' },
  { id: 8, fullName: 'Волков Сергей Михайлович', phone: '+998 33 280-88-08', specialty: 'Имплантолог', cabinet: 3, experienceYears: 20, workDays: [2, 4, 6], workStart: '10:00', workEnd: '18:00', patientsToday: 0, status: 'offShift' },
  { id: 9, fullName: 'Ахмедова Севара Алишеровна', phone: '+998 88 290-99-09', specialty: 'Пародонтолог', cabinet: 7, experienceYears: 8, workDays: [1, 2, 3, 4, 5], workStart: '09:00', workEnd: '18:00', patientsToday: 3, status: 'onShift' },
  { id: 10, fullName: 'Орлова Ирина Викторовна', phone: '+998 90 300-10-10', specialty: 'Эндодонтист', cabinet: 1, experienceYears: 10, workDays: [3, 4, 5, 6], workStart: '11:00', workEnd: '19:00', patientsToday: 2, status: 'onShift' },
  { id: 11, fullName: 'Алиев Тимур Рустамович', phone: '+998 91 310-11-11', specialty: 'Хирург', cabinet: 3, experienceYears: 5, workDays: [2, 4, 6], workStart: '09:00', workEnd: '17:00', patientsToday: 0, status: 'offShift' },
  { id: 12, fullName: 'Морозова Наталья Олеговна', phone: '+998 93 320-12-12', specialty: 'Рентгенолог', cabinet: 8, experienceYears: 14, workDays: [1, 2, 3, 4, 5], workStart: '08:00', workEnd: '17:00', patientsToday: 7, status: 'onShift' },
  { id: 13, fullName: 'Соколов Олег Андреевич', phone: '+998 94 330-13-13', specialty: 'Ортопед', cabinet: 5, experienceYears: 16, workDays: [1, 3, 5], workStart: '10:00', workEnd: '18:00', patientsToday: 0, status: 'vacation' },
  { id: 14, fullName: 'Юлдашева Малика Бахтиёровна', phone: '+998 95 340-14-14', specialty: 'Гигиенист', cabinet: 2, experienceYears: 3, workDays: [1, 2, 3, 4, 5, 6], workStart: '13:00', workEnd: '20:00', patientsToday: 3, status: 'onShift' }
];

// Имитация задержки ответа сервера
const MOCK_DELAY_MS = 300;

@Injectable({ providedIn: 'root' })
export class DoctorsService {
  // TODO: заменить на загрузку с API:
  // this.http.get<Doctor[]>(`${apiUrl}/doctors`)
  private readonly _doctors = signal<Doctor[]>(DOCTORS);

  readonly doctors = this._doctors.asReadonly();

  // TODO: на API — POST /doctors
  add(draft: DoctorDraft): Observable<Doctor> {
    const doctor: Doctor = { ...draft, id: Date.now(), patientsToday: 0 };
    return of(doctor).pipe(
      delay(MOCK_DELAY_MS),
      tap(created => this._doctors.update(list => [...list, created]))
    );
  }

  // TODO: на API — PATCH /doctors/:id
  update(id: number, changes: Partial<DoctorDraft>): Observable<void> {
    return of(undefined).pipe(
      delay(MOCK_DELAY_MS),
      tap(() => this._doctors.update(list =>
        list.map(d => (d.id === id ? { ...d, ...changes } : d))
      )),
      map(() => undefined)
    );
  }

  // TODO: на API — DELETE /doctors/:id
  remove(id: number): Observable<void> {
    return of(undefined).pipe(
      delay(MOCK_DELAY_MS),
      tap(() => this._doctors.update(list => list.filter(d => d.id !== id))),
      map(() => undefined)
    );
  }
}
