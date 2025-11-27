/**
 * Debug utility for Control Center persistence
 *
 * Use this in the browser console to debug persistence issues:
 *
 * window.debugControlCenter()
 */

export function debugControlCenterPersistence() {
  console.group('🔍 Control Center Persistence Debug');

  // Check localStorage
  const localKey = 'controlCenter_local';
  const localValue = localStorage.getItem(localKey);

  console.log('1. LocalStorage Key:', localKey);
  if (localValue) {
    console.log('2. LocalStorage Raw Value:', localValue);
    try {
      const parsed = JSON.parse(localValue);
      console.log('3. LocalStorage Parsed:', parsed);
    } catch (error) {
      console.error('3. LocalStorage Parse Error:', error);
      console.error('   This means the data is corrupted! Raw value:', localValue);
    }
  } else {
    console.warn('2. LocalStorage is EMPTY!');
  }

  // Check Zustand persist key
  const zustandKey = 'control_center_v1';
  const zustandValue = localStorage.getItem(zustandKey);
  console.log('4. Zustand Persist Key:', zustandKey);
  if (zustandValue) {
    console.log('5. Zustand Raw Value:', zustandValue);
    try {
      const parsed = JSON.parse(zustandValue);
      console.log('6. Zustand Parsed:', parsed);
    } catch (error) {
      console.error('6. Zustand Parse Error:', error);
      console.error('   This means the data is corrupted! Raw value:', zustandValue);
    }
  } else {
    console.warn('5. Zustand Persist is EMPTY!');
  }

  console.groupEnd();

  // Try to parse safely
  let localParsed = null;
  let zustandParsed = null;
  try {
    localParsed = localValue ? JSON.parse(localValue) : null;
  } catch (e) {
    console.error('Failed to parse localValue');
  }
  try {
    zustandParsed = zustandValue ? JSON.parse(zustandValue) : null;
  } catch (e) {
    console.error('Failed to parse zustandValue');
  }

  return {
    localKey,
    localValue,
    localParsed,
    zustandKey,
    zustandValue,
    zustandParsed,
  };
}

/**
 * Clear all control center persistence data
 * Use this to reset corrupted state
 */
export function clearControlCenterPersistence() {
  console.group('🧹 Clearing Control Center Persistence');

  const keys = ['controlCenter_local', 'control_center_v1'];
  keys.forEach(key => {
    const hadValue = localStorage.getItem(key) !== null;
    localStorage.removeItem(key);
    console.log(`${hadValue ? '✅' : '⚠️'} Cleared ${key} (${hadValue ? 'had data' : 'was empty'})`);
  });

  console.log('✨ All control center data cleared. Refresh the page to start fresh.');
  console.groupEnd();
}

// Expose to window for console debugging
if (typeof window !== 'undefined') {
  (window as any).debugControlCenter = debugControlCenterPersistence;
  (window as any).clearControlCenter = clearControlCenterPersistence;
  console.log('💡 Debug utilities loaded!');
  console.log('   - window.debugControlCenter() - View stored data');
  console.log('   - window.clearControlCenter() - Clear corrupted data');
}
