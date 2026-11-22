import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { PatientShort, VisitService } from '../models/appointment-form.model';
import { ClinicServicesService } from '../../../shared/services/clinic-services.service';
import { api, params } from '../../../core/api/api';

@Injectable({ providedIn: 'root' })
export class AppointmentFormService {
  private readonly http = inject(HttpClient);
  private readonly clinicServices = inject(ClinicServicesService);
  private readonly services$ = toObservable(this.clinicServices.services);

  // Поиск пациента для формы записи: от 2 символов, до 10 результатов
  searchPatients(query: string): Observable<PatientShort[]> {
    return this.http.get<PatientShort[]>(api('/patients/search'), { params: params({ q: query.trim() }) });
  }

  // Услуги — из справочника «Настройки → Услуги» (GET /services); обновляется, когда справочник загрузится
  getVisitServices(): Observable<VisitService[]> {
    return this.services$;
  }
}
