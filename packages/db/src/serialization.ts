/**
 * JSON helpers for decision D6: Telegram IDs are `BigInt` in the database and
 * strings in every JSON API (`JSON.stringify` throws on `bigint`).
 */

/** Deep type of a value after a JSON round-trip with {@link bigIntReplacer}. */
export type Serialized<T> = T extends bigint
  ? string
  : T extends Date
    ? string
    : T extends (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

/** `JSON.stringify` replacer that turns `bigint` values into strings. */
export function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** Stringifies a value, turning every `bigint` into a string. */
export function stringifyJson(value: unknown, space?: number): string {
  return JSON.stringify(value, bigIntReplacer, space);
}

/** Returns a JSON-safe deep copy: `bigint` → string, `Date` → ISO string. */
export function serializeBigInt<T>(value: T): Serialized<T> {
  if (value === undefined) return value as Serialized<T>;
  return JSON.parse(stringifyJson(value)) as Serialized<T>;
}
