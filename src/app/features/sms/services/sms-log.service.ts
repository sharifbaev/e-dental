import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Page, api, params } from '../../../core/api/api';
import { SmsLogItem, SmsLogQuery } from '../models/sms.model';

// Журнал отправленных SMS (GET /sms — владелец и администратор), новые сверху
@Injectable({ providedIn: 'root' })
export class SmsLogService {
  private readonly http = inject(HttpClient);

  list(query: SmsLogQuery): Observable<Page<SmsLogItem>> {
    return this.http.get<Page<SmsLogItem>>(api('/sms'), {
      params: params({ page: query.page, size: query.size, q: query.q?.trim(), status: query.status, type: query.type })
    });
  }
}
