import { Component, TemplateRef, computed, effect, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { Patient } from '../../models/patient.model';
import { DentalChartService, LOWER_CHILD_TEETH, LOWER_TEETH, ToothState, UPPER_CHILD_TEETH, UPPER_TEETH } from '../../services/dental-chart.service';
import { HEALTHY_STATE_ID, TOOTH_COLOR_CLASSES, ToothStateItem, ToothStatesService } from '../../../../shared/services/tooth-states.service';
import { FeedbackService } from '../../../../shared/services/feedback.service';

export type Dentition = 'adult' | 'child';

// Схема в «единицах ширины» (ширина схемы = 100): размер зуба и зазор между соседями.
// Дуга подбирается сама так, чтобы зубы стояли вплотную, а схема не имела пустых полей
interface ArchShape {
  size: number;     // диаметр зуба
  spacing: number;  // шаг между центрами соседних зубов (чуть больше диаметра)
  between: number;  // зазор между верхней и нижней дугой
}

const ARCH_SHAPES: Record<Dentition, ArchShape> = {
  adult: { size: 8.5, spacing: 9.4, between: 2 },
  child: { size: 12, spacing: 13, between: 2 }
};

// Тип зуба по второй цифре номера FDI (у молочных 4 и 5 — моляры)
const ADULT_TYPES = ['', 'central', 'lateral', 'canine', 'premolar1', 'premolar2', 'molar1', 'molar2', 'molar3'];
const CHILD_TYPES = ['', 'central', 'lateral', 'canine', 'molar1', 'molar2'];
// Четверть по первой цифре: 1/5 — верх справа, 2/6 — верх слева, 3/7 — низ слева, 4/8 — низ справа
const QUADRANTS: Record<number, string> = { 1: 'upperRight', 2: 'upperLeft', 3: 'lowerLeft', 4: 'lowerRight' };

const DIAGNOSIS_STATUS_CLASSES: Record<string, string> = {
  active: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
};

// 'YYYY-MM-DD' → 'DD.MM.YYYY'
function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
}

// Дети до 12 лет — по умолчанию молочные зубы
const CHILD_AGE = 12;

// Длина половины эллипса и точки на ней с шагом по длине (слева через вершину направо)
function sampleArc(rx: number, ry: number): { t: number; len: number }[] {
  const steps = 400;
  const samples: { t: number; len: number }[] = [];
  let length = 0;
  let prev = { x: -rx, y: 0 };
  for (let i = 0; i <= steps; i++) {
    const t = Math.PI - (Math.PI * i) / steps;
    const point = { x: rx * Math.cos(t), y: ry * Math.sin(t) };
    if (i > 0) length += Math.hypot(point.x - prev.x, point.y - prev.y);
    samples.push({ t, len: length });
    prev = point;
  }
  return samples;
}

// Раскладка челюстей: n зубов на дугу. Ширина дуги — во всю схему (крайние зубы у краёв),
// высота подбирается так, чтобы на дуге уместились n зубов с шагом spacing (полшага отступа на концах).
// Возвращает центры зубов в % от ширины (x) и высоты (y) схемы и соотношение сторон схемы
function archLayout(n: number, shape: ArchShape): { aspect: string; upper: { x: number; y: number }[]; lower: { x: number; y: number }[] } {
  const rx = 50 - shape.size / 2;
  const needed = n * shape.spacing;
  // Подбор высоты дуги делением пополам
  let low = 1;
  let high = 200;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    const samples = sampleArc(rx, mid);
    if (samples[samples.length - 1].len < needed) low = mid;
    else high = mid;
  }
  const ry = high;
  const samples = sampleArc(rx, ry);
  const length = samples[samples.length - 1].len;
  const margin = (length - (n - 1) * shape.spacing) / 2;

  const height = 2 * ry + shape.size + shape.between;
  const upperCy = shape.size / 2 + ry;
  const lowerCy = upperCy + shape.between;

  const points = Array.from({ length: n }, (_, index) => {
    const target = margin + index * shape.spacing;
    const sample = samples.find(s => s.len >= target) ?? samples[samples.length - 1];
    return { x: 50 + rx * Math.cos(sample.t), dy: ry * Math.sin(sample.t) };
  });
  return {
    aspect: `100 / ${height.toFixed(2)}`,
    upper: points.map(p => ({ x: p.x, y: ((upperCy - p.dy) / height) * 100 })),
    lower: points.map(p => ({ x: p.x, y: ((lowerCy + p.dy) / height) * 100 }))
  };
}

// Зубная формула по схеме FDI: зубы по дуге челюстей (взрослые — 32, дети — 20). Клик по зубу — выбор состояния, сохраняется сразу
@Component({
  selector: 'app-dental-chart',
  imports: [MatIconModule, TranslocoPipe],
  templateUrl: './dental-chart.html'
})
export class DentalChart {
  private readonly chartService = inject(DentalChartService);
  private readonly statesService = inject(ToothStatesService);
  private readonly dialog = inject(MatDialog);

  // Модалка с инфо о зубе — шаблон из этого же компонента (данные и выбор состояния обновляются сразу)
  private readonly toothInfoTpl = viewChild.required<TemplateRef<unknown>>('toothInfoTpl');
  private infoRef: MatDialogRef<unknown> | null = null;

  readonly patient = input.required<Patient>();
  readonly readonly = input(false);

  private readonly chart = computed(() => this.chartService.chartOf(this.patient()));

  private readonly feedback = inject(FeedbackService);

  constructor() {
    // Формула пациента — с API при открытии карточки
    effect(() => {
      const id = this.patient().id;
      untracked(() => this.chartService.load(id));
    });
  }

  protected readonly selectedTooth = signal<number | null>(null);

  // Состояния из справочника (Настройки → Справочники): своё название или стандартное из переводов
  private toView(item: ToothStateItem) {
    return { state: item.id, name: item.name ?? '', classes: TOOTH_COLOR_CLASSES[item.color], key: `dentalChart.states.${item.id}` };
  }

  private readonly stateViews = computed(() => new Map(this.statesService.states().map(item => [item.id, this.toView(item)])));

  // Состояние удалено из справочника — зуб показываем как здоровый
  private toTooth(number: number) {
    const views = this.stateViews();
    const view = views.get(this.chart()[number] ?? HEALTHY_STATE_ID) ?? views.get(HEALTHY_STATE_ID)!;
    return { number, ...view };
  }

  // Взрослые / дети: по умолчанию — по возрасту пациента (до 12 лет — дети), можно переключить вручную
  protected readonly dentition = linkedSignal<Dentition>(() => this.dentitionByAge());

  private dentitionByAge(): Dentition {
    const birth = this.patient()?.birthDate;
    if (!birth) return 'adult';
    const date = new Date(birth);
    if (isNaN(date.getTime())) return 'adult';
    const now = new Date();
    let age = now.getFullYear() - date.getFullYear();
    if (now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())) age--;
    return age < CHILD_AGE ? 'child' : 'adult';
  }

  protected setDentition(value: Dentition): void {
    this.dentition.set(value);
    this.selectedTooth.set(null);
  }

  protected readonly shape = computed(() => ARCH_SHAPES[this.dentition()]);

  private readonly layout = computed(() => archLayout(this.dentition() === 'child' ? UPPER_CHILD_TEETH.length : UPPER_TEETH.length, this.shape()));

  protected readonly aspect = computed(() => this.layout().aspect);

  // Зубы с позицией на схеме (x, y — центр зуба в %)
  protected readonly teeth = computed(() => {
    const child = this.dentition() === 'child';
    const layout = this.layout();
    const upper = child ? UPPER_CHILD_TEETH : UPPER_TEETH;
    const lower = child ? LOWER_CHILD_TEETH : LOWER_TEETH;
    return [
      ...upper.map((n, i) => ({ ...this.toTooth(n), ...layout.upper[i] })),
      ...lower.map((n, i) => ({ ...this.toTooth(n), ...layout.lower[i] }))
    ];
  });

  protected readonly legend = computed(() => this.statesService.states().map(item => this.toView(item)));

  // Счётчик отмеченных зубов (не «здоров»)
  protected readonly marked = computed(() => Object.keys(this.chart()).length);

  protected readonly selectedState = computed(() => {
    const tooth = this.selectedTooth();
    if (!tooth) return null;
    const state = this.chart()[tooth] ?? HEALTHY_STATE_ID;
    return this.stateViews().has(state) ? state : HEALTHY_STATE_ID;
  });

  // Клик по зубу — модалка с инфо (и в режиме только чтения); закрытие модалки снимает выбор
  protected selectTooth(number: number): void {
    this.selectedTooth.set(number);
    if (this.infoRef) return;
    this.infoRef = this.dialog.open(this.toothInfoTpl(), { width: '440px', maxWidth: '95vw', autoFocus: false });
    this.infoRef.afterClosed().subscribe(() => {
      this.infoRef = null;
      this.selectedTooth.set(null);
    });
  }

  protected closeInfo(): void {
    this.infoRef?.close();
  }

  // Инфо о выбранном зубе: тип, челюсть и сторона, состояние, диагнозы по этому зубу
  protected readonly toothInfo = computed(() => {
    const number = this.selectedTooth();
    if (!number) return null;
    const quadrant = Math.floor(number / 10);
    const position = number % 10;
    const milk = quadrant >= 5;
    const type = (milk ? CHILD_TYPES : ADULT_TYPES)[position] ?? '';
    return {
      number,
      milk,
      typeKey: type ? `dentalChart.types.${type}` : '',
      positionKey: `dentalChart.position.${QUADRANTS[milk ? quadrant - 4 : quadrant]}`,
      state: this.toTooth(number),
      diagnoses: (this.patient().diagnoses ?? [])
        .filter(d => d.tooth === number)
        .map(d => ({
          ...d,
          dateLabel: formatDate(d.date),
          statusKey: `patients.details.diagnosisStatus.${d.status}`,
          statusClass: DIAGNOSIS_STATUS_CLASSES[d.status] ?? ''
        }))
    };
  });

  protected setState(state: ToothState): void {
    const tooth = this.selectedTooth();
    if (!tooth || this.readonly()) return;
    this.chartService.setTooth(this.patient(), tooth, state).subscribe({ error: err => this.feedback.error(err) });
  }
}
