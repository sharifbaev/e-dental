import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, map, of, tap } from 'rxjs';
import { AppointmentDraft, PatientStatus, ScheduleAppointment } from '../models/schedule.model';
import { mockPatientRating } from '../../../shared/models/patient-rating';

// Шаблоны приёмов для mock-данных
const TEMPLATES: Omit<ScheduleAppointment, 'id' | 'date' | 'status'>[] = [
  { start: '09:00', end: '10:00', cabinet: 2, patientId: 7, patientName: 'Смирнова Елена Васильевна', phone: '+998 90 111-22-33', serviceId: 2, service: 'Профессиональная гигиена AirFlow', doctorId: 4, doctorName: 'Савина А. И.' },
  { start: '09:30', end: '10:15', cabinet: 3, patientId: 9, patientName: 'Юлдашева Малика Бахтиёровна', phone: '+998 95 610-20-30', serviceId: 1, service: 'Лечение кариеса', doctorId: 3, doctorName: 'Юсупов Б. Т.' },
  { start: '10:00', end: '10:30', cabinet: 1, patientId: 10, patientName: 'Иванов Дмитрий Андреевич', phone: '+998 33 870-45-12', serviceId: 3, service: 'Консультация и осмотр', doctorId: 1, doctorName: 'Сидоров А. П.' },
  { start: '10:30', end: '11:15', cabinet: 2, patientId: 1, patientName: 'Ковалёв Максим Дмитриевич', phone: '+998 93 555-12-34', serviceId: 1, service: 'Лечение кариеса', doctorId: 4, doctorName: 'Савина А. И.' },
  { start: '11:00', end: '11:30', cabinet: 1, patientId: 2, patientName: 'Смирнов Артур Павлович', phone: '+998 90 123-45-67', serviceId: 3, service: 'Консультация и осмотр', doctorId: 1, doctorName: 'Сидоров А. П.' },
  { start: '12:00', end: '12:30', cabinet: 1, patientId: 3, patientName: 'Михайлова Дарья Игоревна', phone: '+998 97 700-11-22', serviceId: 3, service: 'Консультация и осмотр', doctorId: 1, doctorName: 'Сидоров А. П.' },
  { start: '13:00', end: '13:40', cabinet: 3, patientId: 5, patientName: 'Турсунов Жасур Алишерович', phone: '+998 91 444-78-90', serviceId: 4, service: 'Удаление зуба', doctorId: 3, doctorName: 'Юсупов Б. Т.' },
  { start: '14:00', end: '15:00', cabinet: 2, patientId: 4, patientName: 'Абдуллаева Нилуфар Рустамовна', phone: '+998 99 321-65-87', serviceId: 2, service: 'Профессиональная гигиена AirFlow', doctorId: 2, doctorName: 'Каримова Д. Р.' },
  { start: '15:30', end: '16:15', cabinet: 1, patientId: 6, patientName: 'Петров Сергей Олегович', phone: '+998 94 222-33-44', serviceId: 1, service: 'Лечение кариеса', doctorId: 1, doctorName: 'Сидоров А. П.' },
  { start: '16:30', end: '17:00', cabinet: 3, patientId: 8, patientName: 'Кузнецов Артём Игоревич', phone: '+998 95 777-88-99', serviceId: 3, service: 'Консультация и осмотр', doctorId: 3, doctorName: 'Юсупов Б. Т.' },
  { start: '17:00', end: '18:00', cabinet: 2, patientId: 11, patientName: 'Хасанов Бекзод Улугбекович', phone: '+998 88 505-60-70', serviceId: 2, service: 'Профессиональная гигиена AirFlow', doctorId: 2, doctorName: 'Каримова Д. Р.' },
  { start: '18:00', end: '18:40', cabinet: 3, patientId: 12, patientName: 'Сергеева Анна Викторовна', phone: '+998 90 909-18-27', serviceId: 4, service: 'Удаление зуба', doctorId: 3, doctorName: 'Юсупов Б. Т.' }
];

// Сколько приёмов в день недели (по кругу) и какие статусы
const COUNTS = [8, 9, 6, 8, 11, 5, 4];
const TODAY_STATUSES: PatientStatus[] = ['completed', 'inTreatment', 'primary', 'completed', 'inTreatment', 'primary', 'primary', 'cancelled'];
const FUTURE_STATUSES: PatientStatus[] = ['primary', 'inTreatment', 'primary', 'primary', 'inTreatment', 'cancelled'];

const MOCK_DAYS = 60;
// Прошедшие дни в mock-данных — чтобы в календаре было что показать за прошлые даты
const MOCK_PAST_DAYS = 30;
const PAST_STATUSES: PatientStatus[] = ['completed', 'completed', 'cancelled', 'completed'];

// Имитация задержки ответа сервера
const MOCK_DELAY_MS = 300;

// Date → 'YYYY-MM-DD' по местному времени
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// 'HH:mm' + минуты → 'HH:mm'
export function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const total = Math.min(hours * 60 + mins + minutes, 24 * 60 - 1);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Ближайшие полчаса от текущего времени: 14:10 → 14:30
export function nextHalfHour(): string {
  const now = new Date();
  const total = Math.min(Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30, 23 * 60 + 30);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function buildMock(): ScheduleAppointment[] {
  const result: ScheduleAppointment[] = [];
  const today = new Date();

  for (let dayIndex = -MOCK_PAST_DAYS; dayIndex < MOCK_DAYS; dayIndex++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayIndex);
    const statuses = dayIndex === 0 ? TODAY_STATUSES : dayIndex < 0 ? PAST_STATUSES : FUTURE_STATUSES;
    const index = Math.abs(dayIndex);
    const count = COUNTS[index % COUNTS.length];

    for (let k = 0; k < count; k++) {
      const template = TEMPLATES[(index * 3 + k) % TEMPLATES.length];
      result.push({
        ...template,
        // Прошедшие дни — отдельный диапазон id, чтобы не пересекаться с текущими
        id: dayIndex < 0 ? 100000 + index * 100 + k + 1 : dayIndex * 100 + k + 1,
        date: toDateKey(date),
        status: statuses[(k + index) % statuses.length],
        patientRating: mockPatientRating(template.patientId)
      });
    }
  }

  return result;
}

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  // TODO: заменить на загрузку с API по выбранному периоду:
  // this.http.get<ScheduleAppointment[]>(`${apiUrl}/schedule`, { params: { from, to } })
  private readonly _appointments = signal<ScheduleAppointment[]>(buildMock());

  // По дате, затем по времени начала
  readonly appointments = computed(() =>
    [...this._appointments()].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
  );

  // Новая запись. Время — из формы; если не передано: сегодня — ближайшие полчаса, иначе 09:00;
  // врач — переданный или первый из расписания
  // TODO: на API — POST /appointments, данные врача, даты и слота — из формы
  add(draft: AppointmentDraft, date: string, doctorId?: number): Observable<ScheduleAppointment> {
    const list = this._appointments();
    const doctor = list.find(a => a.doctorId === doctorId) ?? list[0];
    const start = draft.time ?? (date === toDateKey(new Date()) ? nextHalfHour() : '09:00');

    const appointment: ScheduleAppointment = {
      id: Date.now(),
      date,
      start,
      end: addMinutes(start, draft.durationMinutes),
      cabinet: 1,
      patientId: draft.patientId ?? Date.now(),
      patientName: draft.patientName,
      phone: draft.phone,
      serviceId: draft.serviceId,
      service: draft.serviceName,
      doctorId: doctor.doctorId,
      doctorName: doctor.doctorName,
      status: 'primary',
      patientRating: draft.rating ?? (draft.patientId ? mockPatientRating(draft.patientId) : 'good')
    };

    return of(appointment).pipe(
      delay(MOCK_DELAY_MS),
      tap(created => this._appointments.update(items => [...items, created]))
    );
  }

  // TODO: на API — PATCH /appointments/:id
  update(id: number, changes: Partial<ScheduleAppointment>): Observable<void> {
    return of(undefined).pipe(
      delay(MOCK_DELAY_MS),
      tap(() => this._appointments.update(list =>
        list.map(a => (a.id === id ? { ...a, ...changes } : a))
      )),
      map(() => undefined)
    );
  }

  // TODO: на API — POST /appointments/:id/cancel
  cancel(id: number): Observable<void> {
    return this.update(id, { status: 'cancelled' });
  }
}
