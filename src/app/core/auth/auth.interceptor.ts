import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

// Запросы, на которые 401 означает «неверные данные», а не «истёк токен»
const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

// Добавляет токен и язык к запросам на API. При 401 один раз обновляет токен
// (POST /auth/refresh) и повторяет запрос; не вышло — выход на экран входа.
// Запросы к статике (переводы /i18n и т.п.) не трогает.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const transloco = inject(TranslocoService);
  const isApiRequest = req.url.startsWith(environment.apiUrl);
  if (!isApiRequest) return next(req);

  const isAuthPath = AUTH_PATHS.some(path => req.url.endsWith(path));

  const withHeaders = (request: HttpRequest<unknown>, token: string | null) => request.clone({
    setHeaders: {
      'Accept-Language': transloco.getActiveLang(),
      ...(token && !isAuthPath ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  return next(withHeaders(req, auth.getToken())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isAuthPath) {
        return throwError(() => error);
      }
      if (!auth.hasRefreshToken()) {
        auth.expire();
        return throwError(() => error);
      }
      return auth.refresh().pipe(
        catchError(refreshError => {
          auth.expire();
          return throwError(() => refreshError);
        }),
        switchMap(token => next(withHeaders(req, token)))
      );
    })
  );
};
