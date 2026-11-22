import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { FeedbackDialog, FeedbackDialogData } from '../components/feedback-dialog/feedback-dialog';
import { apiError, errorCode } from '../../core/api/api';

// Короткие окна результата действия: успех или ошибка
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  success(titleKey: string, messageKey?: string, messageParams?: Record<string, unknown>): void {
    this.open({ type: 'success', titleKey, messageKey, messageParams });
  }

  // error() — общее сообщение; error(err) — текст по коду ошибки сервера (apiErrors.<code>),
  // если перевода нет — message из ответа сервера
  error(titleKeyOrError: unknown = 'feedback.errorTitle', messageKey = 'feedback.errorMessage'): void {
    if (typeof titleKeyOrError === 'string') {
      this.open({ type: 'error', titleKey: titleKeyOrError, messageKey });
      return;
    }
    const code = errorCode(titleKeyOrError);
    const key = `apiErrors.${code}`;
    if (code && this.transloco.translate(key) !== key) {
      this.open({ type: 'error', titleKey: 'feedback.errorTitle', messageKey: key });
      return;
    }
    const message = apiError(titleKeyOrError)?.message;
    this.open({ type: 'error', titleKey: 'feedback.errorTitle', messageKey: message ? undefined : 'feedback.errorMessage', message });
  }

  private open(data: FeedbackDialogData): void {
    this.dialog.open(FeedbackDialog, { data, width: '360px', maxWidth: '95vw', autoFocus: false });
  }
}
