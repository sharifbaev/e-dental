import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { Appointment, DashboardSummary, ShiftDoctor, TodayPatient } from '../models/dashboard.model';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  // TODO: заменить на реальный запрос, когда будет API:
  // return this.http.get<DashboardSummary>(`${apiUrl}/dashboard/summary`);
  getSummary(): Observable<DashboardSummary> {
    return of<DashboardSummary>({
      clinicOpen: true,
      clinicLoad: 88,
      waitingList: 3,
      patientsToday: 24,
      patientsTrend: 12,
      freeSlots: [
        { doctorId: 1, doctorName: 'Сидоров А. П.', slots: ['09:00', '10:30', '11:30', '15:00', '17:30', '18:00', '18:30', '19:00', '19:30', '22:30', '23:00', '23:30'] },
        { doctorId: 2, doctorName: 'Каримова Д. Р.', slots: ['09:30', '14:00', '16:30', '17:00', '18:00', '19:00', '22:45', '23:15'] },
        { doctorId: 3, doctorName: 'Юсупов Б. Т.', slots: ['12:00', '13:30', '18:30', '20:00', '23:00'] }
      ],
      doctorsOnShift: 5,
      doctorsTotal: 7,
      revenueToday: 184500,
      revenueTrend: 8,
      revenuePlanPercent: 82
    }).pipe(delay(300));
  }

  // TODO: заменить на реальный запрос, когда будет API:
  // return this.http.get<TodayPatient[]>(`${apiUrl}/dashboard/patients-today`);
  getTodayPatients(): Observable<TodayPatient[]> {
    return of<TodayPatient[]>([
      { id: 1, time: '09:00', fullName: 'Абдуллаева Нилуфар Рустамовна', service: 'Профессиональная чистка', doctorName: 'Каримова Д. Р.' },
      { id: 2, time: '09:30', fullName: 'Петров Сергей Олегович', service: 'Консультация ортодонта', doctorName: 'Сидоров А. П.' },
      { id: 3, time: '10:30', fullName: 'Ковалёв Максим Дмитриевич', service: 'Лечение кариеса, пломбирование', doctorName: 'Савина А. И.' },
      { id: 4, time: '11:00', fullName: 'Смирнов Артур Павлович', service: 'Первичная консультация', doctorName: 'Юсупов Б. Т.' },
      { id: 5, time: '11:45', fullName: 'Михайлова Дарья Игоревна', service: 'Профессиональная чистка AirFlow', doctorName: 'Савина А. И.' },
      { id: 6, time: '13:00', fullName: 'Турсунов Жасур Алишерович', service: 'Удаление зуба', doctorName: 'Юсупов Б. Т.' }
    ]).pipe(delay(300));
  }

  // TODO: заменить на реальный запрос, когда будет API:
  // return this.http.get<ShiftDoctor[]>(`${apiUrl}/dashboard/doctors-shift`);
  getShiftDoctors(): Observable<ShiftDoctor[]> {
    return of<ShiftDoctor[]>([
      { id: 1, name: 'Сидоров А. П.', specialty: 'Терапевт', onShift: true, shiftStart: '09:00', shiftEnd: '18:00', patientsToday: 6 },
      { id: 2, name: 'Каримова Д. Р.', specialty: 'Гигиенист', onShift: true, shiftStart: '09:00', shiftEnd: '17:00', patientsToday: 5 },
      { id: 3, name: 'Юсупов Б. Т.', specialty: 'Хирург', onShift: true, shiftStart: '10:00', shiftEnd: '19:00', patientsToday: 4 },
      { id: 4, name: 'Савина А. И.', specialty: 'Терапевт', onShift: true, shiftStart: '08:00', shiftEnd: '16:00', patientsToday: 5 },
      { id: 5, name: 'Рахимов Ш. К.', specialty: 'Ортодонт', onShift: true, shiftStart: '12:00', shiftEnd: '20:00', patientsToday: 4 },
      { id: 6, name: 'Ким Е. В.', specialty: 'Ортопед', onShift: false, patientsToday: 0 },
      { id: 7, name: 'Назарова М. С.', specialty: 'Детский стоматолог', onShift: false, patientsToday: 0 }
    ]).pipe(delay(300));
  }

  // TODO: заменить на реальный запрос, когда будет API:
  // return this.http.get<Appointment[]>(`${apiUrl}/dashboard/appointments/upcoming`);
  getUpcomingAppointments(): Observable<Appointment[]> {
    // Mock: время приёмов считаем от текущего, чтобы раздел можно было проверить в любое время.
    // Шаг сжимается к концу дня, чтобы все приёмы уложились до 23:59 и не ушли за полночь
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const count = 10;
    const minutesLeft = 24 * 60 - 1 - nowMinutes;
    const step = Math.max(1, Math.min(15, Math.floor(minutesLeft / count)));

    const at = (index: number): string => {
      const total = Math.min(nowMinutes + step * index, 24 * 60 - 1);
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    };

    return of<Appointment[]>([
      { id: 1, time: at(1), cabinet: 1, patientName: 'Смирнов Артур Павлович', service: 'Первичная консультация ортодонта', status: 'confirmed', doctorId: 3, doctorName: 'Юсупов Б. Т.', phone: '+998 90 123-45-67' },
      { id: 2, time: at(2), cabinet: 2, patientName: 'Ковалёв Максим Дмитриевич', service: 'Лечение кариеса, пломбирование', status: 'arrived', doctorId: 1, doctorName: 'Сидоров А. П.', phone: '+998 93 555-12-34' },
      { id: 3, time: at(3), cabinet: 3, patientName: 'Михайлова Дарья Игоревна', service: 'Профессиональная чистка AirFlow', status: 'pending', doctorId: 2, doctorName: 'Каримова Д. Р.', phone: '+998 97 700-11-22' },
      { id: 4, time: at(4), cabinet: 1, patientName: 'Абдуллаева Нилуфар Рустамовна', service: 'Консультация терапевта', status: 'confirmed', doctorId: 1, doctorName: 'Сидоров А. П.', phone: '+998 99 321-65-87' },
      { id: 5, time: at(5), cabinet: 2, patientName: 'Турсунов Жасур Алишерович', service: 'Удаление зуба', status: 'confirmed', doctorId: 3, doctorName: 'Юсупов Б. Т.', phone: '+998 91 444-78-90' },
      { id: 6, time: at(6), cabinet: 3, patientName: 'Петров Сергей Олегович', service: 'Профессиональная чистка', status: 'pending', doctorId: 2, doctorName: 'Каримова Д. Р.', phone: '+998 94 222-33-44' },
      { id: 7, time: at(7), cabinet: 1, patientName: 'Юлдашева Малика Бахтиёровна', service: 'Отбеливание зубов', status: 'confirmed', doctorId: 2, doctorName: 'Каримова Д. Р.', phone: '+998 95 610-20-30' },
      { id: 8, time: at(8), cabinet: 2, patientName: 'Иванов Дмитрий Андреевич', service: 'Установка пломбы', status: 'pending', doctorId: 1, doctorName: 'Сидоров А. П.', phone: '+998 33 870-45-12' },
      { id: 9, time: at(9), cabinet: 3, patientName: 'Хасанов Бекзод Улугбекович', service: 'Удаление зуба мудрости', status: 'confirmed', doctorId: 3, doctorName: 'Юсупов Б. Т.', phone: '+998 88 505-60-70' },
      { id: 10, time: at(10), cabinet: 1, patientName: 'Сергеева Анна Викторовна', service: 'Лечение пульпита', status: 'confirmed', doctorId: 1, doctorName: 'Сидоров А. П.', phone: '+998 90 909-18-27' }
    ]).pipe(delay(300));
  }
}
