export type ValueOrError<V, E> = { value: V } | { error: E }

export const catchExceptions =
  <Args extends unknown[], Res>(f: (...args: Args) => Res) =>
  (...args: Args): ValueOrError<Res, any> => {
    try {
      return { value: f(...args) }
    } catch (error) {
      return { error }
    }
  }

export const isError = <V, E>(result: ValueOrError<V, E>): result is { error: E } => 'error' in result

export const isValue = <V, E>(result: ValueOrError<V, E>): result is { value: V } => 'value' in result

export function normalizeIndent(template: TemplateStringsArray) {
  const codeLines = template[0]?.split('\n') ?? ['']
  const leftPadding = codeLines[1]?.match(/\s+/)?.[0] ?? ''
  return codeLines.map((line) => line.slice(leftPadding.length)).join('\n')
}
