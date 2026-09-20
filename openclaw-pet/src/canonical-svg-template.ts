export type TemplateResult = string;

export const nothing = "";

export function svg(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((output, chunk, index) => output + chunk + (index < values.length ? String(values[index] ?? "") : ""), "");
}
