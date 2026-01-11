type UnknownRecord = Record<string, unknown>;

const isUpperCase = (char: string): boolean => char >= 'A' && char <= 'Z';
const isLowerCase = (char: string): boolean => char >= 'a' && char <= 'z';
const isDigit = (char: string): boolean => char >= '0' && char <= '9';

const isPlainObject = (value: unknown): value is UnknownRecord => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

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
