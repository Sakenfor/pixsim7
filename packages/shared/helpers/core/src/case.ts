/**
 * Case conversion utilities
 *
 * Utilities for converting between camelCase and snake_case.
 * Useful for API data transformation between frontend and backend conventions.
 */

type UnknownRecord = Record<string, unknown>;

const isUpperCase = (char: string): boolean => char >= 'A' && char <= 'Z';
const isLowerCase = (char: string): boolean => char >= 'a' && char <= 'z';
const isDigit = (char: string): boolean => char >= '0' && char <= '9';
const capitalize = (value: string): string =>
  value.length > 0 ? `${value[0].toUpperCase()}${value.slice(1)}` : value;

const isPlainObject = (value: unknown): value is UnknownRecord => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * Convert a camelCase string to snake_case.
 *
 * @param value - String to convert
 * @returns snake_case string
 *
 * @example
 * ```ts
 * toSnakeCaseKey('myPropertyName') // 'my_property_name'
 * toSnakeCaseKey('HTTPSConnection') // 'https_connection'
 * ```
 */
export const toSnakeCaseKey = (value: string): string => {
  if (!value) {
    return value;
  }

  let result = '';
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const prev = value[i - 1];
    const next = value[i + 1];

    if (isUpperCase(char)) {
      const prevIsLowerOrDigit = !!prev && (isLowerCase(prev) || isDigit(prev));
      const prevIsUpper = !!prev && isUpperCase(prev);
      const nextIsLowerOrDigit = !!next && (isLowerCase(next) || isDigit(next));

      if (i > 0 && (prevIsLowerOrDigit || (prevIsUpper && nextIsLowerOrDigit))) {
        result += '_';
      }
      result += char.toLowerCase();
    } else {
      result += char;
    }
  }

  return result;
};

/**
 * Convert a snake_case or kebab-case string to camelCase.
 *
 * @param value - String to convert
 * @returns camelCase string
 *
 * @example
 * ```ts
 * toCamelCaseKey('my_property_name') // 'myPropertyName'
 * toCamelCaseKey('runtime-kind') // 'runtimeKind'
 * ```
 */
export const toCamelCaseKey = (value: string): string => {
  if (!value) {
    return value;
  }

  const parts = value.split(/[_\-\s]+/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return '';
  }
  if (parts.length === 1) {
    return `${parts[0][0].toLowerCase()}${parts[0].slice(1)}`;
  }

  const [head, ...tail] = parts;
  return `${head.toLowerCase()}${tail.map((segment) => capitalize(segment.toLowerCase())).join('')}`;
};

/**
 * Recursively convert all object keys from camelCase to snake_case.
 *
 * @param value - Object or array to convert
 * @returns Converted object with snake_case keys
 *
 * @example
 * ```ts
 * toSnakeCaseDeep({ myProp: { nestedProp: 'value' } })
 * // { my_prop: { nested_prop: 'value' } }
 * ```
 */
export const toSnakeCaseDeep = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((entry) => toSnakeCaseDeep(entry)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const result: UnknownRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    result[toSnakeCaseKey(key)] = toSnakeCaseDeep(entry);
  }

  return result as T;
};

/**
 * Recursively convert all object keys from snake_case to camelCase.
 *
 * @param value - Object or array to convert
 * @returns Converted object with camelCase keys
 *
 * @example
 * ```ts
 * toCamelCaseDeep({ my_prop: { nested_prop: 'value' } })
 * // { myProp: { nestedProp: 'value' } }
 * ```
 */
export const toCamelCaseDeep = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((entry) => toCamelCaseDeep(entry)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const result: UnknownRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    result[toCamelCaseKey(key)] = toCamelCaseDeep(entry);
  }

  return result as T;
};

/**
 * Convert object keys from camelCase to snake_case (shallow, top-level only).
 *
 * @param value - Object to convert
 * @returns Converted object with snake_case keys
 *
 * @example
 * ```ts
 * toSnakeCaseShallow({ myProp: { nestedProp: 'value' } })
 * // { my_prop: { nestedProp: 'value' } }
 * ```
 */
export const toSnakeCaseShallow = <T>(value: T): T => {
  if (!isPlainObject(value)) {
    return value;
  }

  const result: UnknownRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    result[toSnakeCaseKey(key)] = entry;
  }

  return result as T;
};

/**
 * Convert object keys from snake_case to camelCase (shallow, top-level only).
 *
 * @param value - Object to convert
 * @returns Converted object with camelCase keys
 *
 * @example
 * ```ts
 * toCamelCaseShallow({ my_prop: { nested_prop: 'value' } })
 * // { myProp: { nested_prop: 'value' } }
 * ```
 */
export const toCamelCaseShallow = <T>(value: T): T => {
  if (!isPlainObject(value)) {
    return value;
  }

  const result: UnknownRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    result[toCamelCaseKey(key)] = entry;
  }

  return result as T;
};
