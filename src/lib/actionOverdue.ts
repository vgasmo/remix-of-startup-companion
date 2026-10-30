/** Open actions only: validation requests are a separate queue. */
export function isActionOverdue(action: { status: string; due_date: string | null }, today = new Date()) {
  if (!action.due_date || !['pending', 'in_progress'].includes(action.status)) return false;
  const currentDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(today);
  return action.due_date.slice(0, 10) < currentDate;
}