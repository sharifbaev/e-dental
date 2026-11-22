import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { Appointment, DashboardSummary, DoctorSlots, ShiftDoctor, TodayPatient } from '../models/dashboard.model';
import { AppointmentDto } from '../../schedule/models/schedule.model';
import { api } from '../../../core/api/api';

// Ответ GET /dashboard/summary
interface SummaryDto {
  patientsToday: number;
  patientsTrendPct: number;
  doctorsOnShift: number;
  doctorsTotal: number;
  loadPct: number;
  waitingList: number;
  revenueToday?: number;       // только владельцу
}

// Главная: сводка, ближайшие приёмы, пациенты сегодня, врачи на смене, свободные окна (/dashboard/*)
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  getSummary(): Observable<DashboardSummary> {
    return forkJoin({
      summary: this.http.get<SummaryDto>(api('/dashboard/summary')),
      freeSlots: this.http.get<DoctorSlots[]>(api('/dashboard/free-slots'))
    }).pipe(
      map(({ summary, freeSlots }) => ({
        clinicLoad: summary.loadPct,
        waitingList: summary.waitingList,
        patientsToday: summary.patientsToday,
        patientsTrend: summary.patientsTrendPct,
        freeSlots,
        doctorsOnShift: summary.doctorsOnShift,
        doctorsTotal: summary.doctorsTotal,
        revenueToday: summary.revenueToday
      }))
    );
  }

  getTodayPatients(): Observable<TodayPatient[]> {
    return this.http.get<TodayPatient[]>(api('/dashboard/patients-today'));
  }

  getShiftDoctors(): Observable<ShiftDoctor[]> {
    return this.http.get<ShiftDoctor[]>(api('/dashboard/doctors-shift'));
  }

  // Неотменённые приёмы сегодня, которые ещё не закончились
  getUpcomingAppointments(): Observable<Appointment[]> {
    return this.http.get<AppointmentDto[]>(api('/dashboard/appointments/upcoming')).pipe(
      map(list => list.map(a => ({
        id: a.id,
        time: a.start,
        cabinet: a.cabinet,
        patientName: a.patientName,
        service: a.service,
        // Пришёл — статус уже сменили с «Первичный»; иначе — подтверждена запись или нет
        status: a.status !== 'primary' ? 'arrived' as const : a.confirmation ? 'confirmed' as const : 'pending' as const,
        doctorId: a.doctorId,
        doctorName: a.doctorName,
        phone: a.phone
      })))
    );
  }
}
