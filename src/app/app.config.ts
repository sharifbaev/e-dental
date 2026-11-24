import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { catchError, of } from 'rxjs';
import { AuthService } from './core/auth/auth.service';
import { PreloadAllModules, provideRouter, withPreloading } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/auth/auth.interceptor';
import { TranslocoHttpLoader } from './transloco-loader';
import { provideTransloco } from '@jsverse/transloco';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Разделы подгружаются в фоне сразу после старта — переход по меню без ожидания загрузки кода
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptors([authInterceptor])),
    // После перезагрузки страницы — свежие данные пользователя (роль, клиника); не дожидаемся ответа
    provideAppInitializer(() => {
      removeDemoData();
      inject(AuthService).loadMe().pipe(catchError(() => of(null))).subscribe();
    }),
    provideTransloco({
      config: {
        availableLangs: ['ru', 'uz'],
        defaultLang: 'ru',
        reRenderOnLangChange: true,
        prodMode: !isDevMode()
      },
      loader: TranslocoHttpLoader,
    }),
  ],
};

// Данные демо-версии, которые раньше хранились в браузере, — теперь всё на сервере
const DEMO_KEYS = ['e-dental.expenses', 'e-dental.debts', 'e-dental.services', 'e-dental.settings', 'e-dental.showOtherDoctors', 'e-dental.dashboard.showKpiMobile'];

function removeDemoData(): void {
  try {
    DEMO_KEYS.forEach(key => localStorage.removeItem(key));
  } catch {
    // localStorage недоступен
  }
}
