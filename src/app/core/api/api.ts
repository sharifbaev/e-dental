import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

// Адрес API: '/api' + путь. Пример: api('/patients') → '/api/patients'
export function api(path: string): string {
  return `${environment.apiUrl}${path}`;
}

// Ошибка бэкенда: { code, message, fields?, patient? }
export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string>;
  patient?: unknown;
}

// Код ошибки из ответа сервера ('slotTaken', 'phoneExists' …); нет — пустая строка
export function errorCode(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as Partial<ApiError> | null;
    if (body && typeof body === 'object' && typeof body.code === 'string') return body.code;
    if (error.status === 0) return 'network';
  }
  return '';
}

export function apiError(error: unknown): ApiError | null {
  if (error instanceof HttpErrorResponse && error.error && typeof error.error === 'object' && 'code' in error.error) {
    return error.error as ApiError;
  }
  return null;
}

// Параметры запроса без пустых значений; массивы — через запятую
export function params(values: Record<string, string | number | boolean | (string | number)[] | null | undefined>): HttpParams {
  let result = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) result = result.set(key, value.join(','));
      continue;
    }
    result = result.set(key, String(value));
  }
  return result;
}

// Страница списка: { items, total, page, size }
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

// Максимальный размер страницы на сервере
export const MAX_PAGE_SIZE = 100;
