import { useMemo, useEffect, useCallback } from 'react';

const STREAK_KEY = 'founder_progress_streak';
const LAST_ACTIVITY_KEY = 'founder_last_activity_week';

interface StreakData {
  currentStreak: number;
  lastActivityWeek: string;
}

function getCurrentWeek(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

function getStreakData(): StreakData {
  try {
    const stored = localStorage.getItem(STREAK_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return { currentStreak: 0, lastActivityWeek: '' };
}

function saveStreakData(data: StreakData): void {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

function getPreviousWeek(week: string): string {
  const [year, weekPart] = week.split('-W');
  const weekNum = parseInt(weekPart, 10);
  
  if (weekNum <= 1) {
    return `${parseInt(year, 10) - 1}-W52`;
  }
  return `${year}-W${(weekNum - 1).toString().padStart(2, '0')}`;
}

/**
 * Tracks founder activity streaks based on weekly engagement.
 * Returns current streak count and a function to record activity.
 */
export function useProgressStreak() {
  const currentWeek = getCurrentWeek();
  
  const streakData = useMemo(() => {
    const data = getStreakData();
    const previousWeek = getPreviousWeek(currentWeek);
    
    // If last activity was this week, streak is current
    if (data.lastActivityWeek === currentWeek) {
      return data;
    }
    
    // If last activity was last week, streak continues but needs update
    if (data.lastActivityWeek === previousWeek) {
      return data;
    }
    
    // Streak is broken
    return { currentStreak: 0, lastActivityWeek: data.lastActivityWeek };
  }, [currentWeek]);

  const recordActivity = () => {
    const data = getStreakData();
    const previousWeek = getPreviousWeek(currentWeek);
    
    if (data.lastActivityWeek === currentWeek) {
      // Already recorded this week
      return;
    }
    
    let newStreak: number;
    if (data.lastActivityWeek === previousWeek) {
      // Continuing streak
      newStreak = data.currentStreak + 1;
    } else if (!data.lastActivityWeek) {
      // First activity ever
      newStreak = 1;
    } else {
      // Streak broken, starting fresh
      newStreak = 1;
    }
    
    saveStreakData({
      currentStreak: newStreak,
      lastActivityWeek: currentWeek,
    });
  };

  return {
    streakWeeks: streakData.currentStreak,
    recordActivity,
    isActiveThisWeek: streakData.lastActivityWeek === currentWeek,
  };
}

/**
 * Auto-records activity when the component mounts (useful on dashboard).
 */
export function useAutoRecordActivity() {
  const { recordActivity } = useProgressStreak();
  
  useEffect(() => {
    recordActivity();
  }, []);
}