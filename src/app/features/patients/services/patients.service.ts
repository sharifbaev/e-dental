import { Injectable, signal } from '@angular/core';
import { Observable, delay, map, of, tap } from 'rxjs';
import { PatientStatus } from '../../../shared/models/patient-status';
import { Diagnosis, Patient } from '../models/patient.model';

// ---- Mock-данные: 45 пациентов ----

const MALE = {
  last: ['Ковалёв', 'Смирнов', 'Турсунов', 'Петров', 'Иванов', 'Хасанов', 'Кузнецов', 'Рахимов', 'Алиев', 'Соколов', 'Юлдашев', 'Морозов'],
  first: ['Максим', 'Артур', 'Жасур', 'Сергей', 'Дмитрий', 'Бекзод', 'Артём', 'Шерзод', 'Тимур', 'Андрей', 'Азиз', 'Олег'],
  middle: ['Дмитриевич', 'Павлович', 'Алишерович', 'Олегович', 'Андреевич', 'Улугбекович', 'Игоревич', 'Рустамович']
};

const FEMALE = {
  last: ['Михайлова', 'Абдуллаева', 'Смирнова', 'Юлдашева', 'Сергеева', 'Каримова', 'Иванова', 'Назарова', 'Волкова', 'Ахмедова', 'Орлова'],
  first: ['Дарья', 'Нилуфар', 'Елена', 'Малика', 'Анна', 'Дильноза', 'Ольга', 'Мадина', 'Ирина', 'Севара', 'Наталья'],
  middle: ['Игоревна', 'Рустамовна', 'Васильевна', 'Бахтиёровна', 'Викторовна', 'Алишеровна', 'Сергеевна', 'Шухратовна']
};

export const DOCTORS = ['Сидоров А. П.', 'Каримова Д. Р.', 'Юсупов Б. Т.', 'Савина А. И.', 'Рахимов Ш. К.'];

const STATUSES: PatientStatus[] = ['inTreatment', 'primary', 'completed', 'inTreatment', 'primary', 'completed', 'cancelled'];
const TIMES = ['09:00', '10:30', '11:30', '14:00', '15:30', '17:00'];
const PREFIXES = ['90', '91', '93', '94', '95', '97', '99', '33', '88'];

const DIAGNOSES: Omit<Diagnosis, 'id' | 'date' | 'doctorName' | 'status'>[] = [
  { title: 'Кариес дентина', tooth: 36, description: 'Средний кариес на жевательной поверхности. Проведено препарирование, установлена светоотверждаемая пломба.' },
  { title: 'Хронический пульпит', tooth: 24, description: 'Боль при накусывании. Проведено эндодонтическое лечение в два посещения, каналы запломбированы, установлена временная пломба.' },
  { title: 'Гингивит', description: 'Кровоточивость дёсен при чистке. Проведена профессиональная гигиена, назначены полоскания и рекомендации по уходу.' },
  { title: 'Зубной камень', description: 'Наддесневые отложения в области нижних фронтальных зубов. Проведена ультразвуковая чистка и AirFlow.' },
  { title: 'Ретинированный зуб мудрости', tooth: 48, description: 'По снимку — неправильное положение зуба. Рекомендовано удаление, пациент записан к хирургу.' },
  { title: 'Хронический периодонтит', tooth: 46, description: 'На снимке очаг у верхушки корня. Перелечивание каналов, контрольный снимок через 6 месяцев.' },
  { title: 'Скученность зубов', description: 'Консультация ортодонта. Предложено лечение элайнерами, сделаны слепки.' }
];

function dateKey(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// 0–4 диагноза на пациента, новые сверху
function buildDiagnoses(index: number, status: PatientStatus): Diagnosis[] {
  const count = status === 'primary' ? index % 2 : (index % 4) + 1;

  return Array.from({ length: count }, (_, k) => {
    const template = DIAGNOSES[(index + k * 2) % DIAGNOSES.length];
    return {
      ...template,
      id: index * 10 + k + 1,
      date: dateKey(-(k * 45 + (index % 30) + 3)),
      doctorName: DOCTORS[(index + k) % DOCTORS.length],
      // Самый свежий диагноз у пациента «в лечении» ещё лечится
      status: k === 0 && status === 'inTreatment' ? 'active' : 'resolved'
    };
  });
}

function buildMock(count: number): Patient[] {
  return Array.from({ length: count }, (_, i) => {
    const isMale = i % 2 === 0;
    const names = isMale ? MALE : FEMALE;
    const status = STATUSES[i % STATUSES.length];
    const hasNext = status === 'primary' || status === 'inTreatment';
    const digits = String(1000000 + ((i * 7919) % 9000000)).slice(-7);

    return {
      id: i + 1,
      fullName: `${names.last[i % names.last.length]} ${names.first[(i * 3) % names.first.length]} ${names.middle[(i * 5) % names.middle.length]}`,
      phone: `+998 ${PREFIXES[i % PREFIXES.length]} ${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`,
      birthDate: `${1960 + ((i * 7) % 48)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
      gender: isMale ? 'male' : 'female',
      status,
      doctorName: DOCTORS[i % DOCTORS.length],
      lastVisit: status === 'primary' && i % 3 === 0 ? undefined : dateKey(-((i * 11) % 120) - 1),
      nextVisit: hasNext ? dateKey((i * 3) % 21 + 1) : undefined,
      nextVisitTime: hasNext ? TIMES[i % TIMES.length] : undefined,
      diagnoses: buildDiagnoses(i, status)
    };
  });
}

// Имитация задержки ответа сервера
const MOCK_DELAY_MS = 300;

@Injectable({ providedIn: 'root' })
export class PatientsService {
  // TODO: заменить на загрузку с API (с поиском и постраничным выводом на сервере):
  // this.http.get<Page<Patient>>(`${apiUrl}/patients`, { params: { q, statuses, page, size } })
  private readonly _patients = signal<Patient[]>(buildMock(45));

  readonly patients = this._patients.asReadonly();

  // TODO: заменить на список врачей с API
  readonly doctors = DOCTORS;

  // TODO: на API — PATCH /patients/:id
  update(id: number, changes: Partial<Patient>): Observable<void> {
    return of(undefined).pipe(
      delay(MOCK_DELAY_MS),
      tap(() => this._patients.update(list =>
        list.map(p => (p.id === id ? { ...p, ...changes } : p))
      )),
      map(() => undefined)
    );
  }
}
