import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { FeedbackDialog, FeedbackDialogData } from '../components/feedback-dialog/feedback-dialog';

// Короткие окна результата действия: успех или ошибка
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly dialog = inject(MatDialog);

  success(titleKey: string, messageKey?: string, messageParams?: Record<string, unknown>): void {
    this.open({ type: 'success', titleKey, messageKey, messageParams });
  }

  error(titleKey = 'feedback.errorTitle', messageKey = 'feedback.errorMessage'): void {
    this.open({ type: 'error', titleKey, messageKey });
  }

  private open(data: FeedbackDialogData): void {
    this.dialog.open(FeedbackDialog, { data, width: '360px', maxWidth: '95vw', autoFocus: false });
  }
}
