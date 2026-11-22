// «Сидоров Андрей Петрович» → «Сидоров А. П.»
export function shortName(fullName: string): string {
  const [last, ...rest] = fullName.trim().split(/\s+/);
  if (!last) return '';
  return [last, ...rest.map(part => `${part[0].toUpperCase()}.`)].join(' ');
}
