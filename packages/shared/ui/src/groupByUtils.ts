/** Toggle a value in/out of an ordered stack. Returns a new array. */
export function toggleInStack<T>(stack: T[], value: T): T[] {
  const index = stack.indexOf(value);
  if (index >= 0) {
    const next = [...stack];
    next.splice(index, 1);
    return next;
  }
  return [...stack, value];
}

/** Clear the stack — convenience for onClear callbacks. */
export function clearStack(): [] {
  return [];
}
