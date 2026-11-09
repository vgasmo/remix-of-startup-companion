import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { invokeWithAuth } from "@/lib/invokeWithAuth";
import { lisbonWallClockToUtcIso, utcIsoToLisbonWallClock } from "@/lib/dateUtils";

interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

interface FreeBusyResult {
  slots: TimeSlot[];
  consultantEmail?: string;
  consultantName?: string;
  warning?: string;
  success?: boolean;
  reason?: string;
}

/**
 * Hook to check consultant's calendar availability via Graph API integration
 * @param durationMinutes - optional duration filter (sent to backend for correctness)
 */
export function useConsultantAvailability(
  workspaceId: string | undefined,
  date: string | undefined,
  durationMinutes?: number
) {
  return useQuery({
    queryKey: ['consultant-availability', workspaceId, date, durationMinutes],
    queryFn: async (): Promise<FreeBusyResult | null> => {
      if (!workspaceId || !date) return null;

      // Always ask backend; it will gracefully degrade (and can return warnings/reasons)
      const { data, error } = await invokeWithAuth('check-consultant-availability', {
        body: { workspaceId, date, durationMinutes },
      });

      if (error) {
        logger.error('[useConsultantAvailability] Failed to check availability', {}, error);
        return null;
      }

      return data;
    },
    enabled: !!workspaceId && !!date,
    staleTime: 30000,
    gcTime: 60000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to validate a specific time slot against cached consultant availability.
 * Uses the already-fetched check-consultant-availability data client-side.
 */
export function useValidateBookingSlot() {
  return useMutation({
    mutationFn: async ({
      workspaceId,
      startTime,
      endTime,
    }: {
      workspaceId: string;
      startTime: string;
      endTime: string;
    }): Promise<{ available: boolean; checked: boolean; conflict?: string; reason?: string }> => {
      try {
        const requestedStart = new Date(startTime).getTime();
        const requestedEnd = new Date(endTime).getTime();
        // RC12: a data e os slots são "relógio de Lisboa"; a duração tem de seguir para o servidor
        // (antes ia sempre 60 min e a validação de sessões de 90/120 min falhava sempre).
        const date = utcIsoToLisbonWallClock(startTime).slice(0, 10);
        const durationMinutes = Math.round((requestedEnd - requestedStart) / 60000);
        const { data, error } = await invokeWithAuth('check-consultant-availability', {
          body: { workspaceId, date, durationMinutes },
        });

        if (error || !data?.success) {
          return { available: true, checked: false, reason: data?.reason || 'not_checked' };
        }

        // O servidor só devolve slots livres: dia todo ocupado => lista vazia => NÃO está disponível.
        const slots = (data.slots ?? []) as TimeSlot[];
        const isFree = slots.some((slot) => {
          const slotStart = new Date(lisbonWallClockToUtcIso(slot.start)).getTime();
          const slotEnd = new Date(lisbonWallClockToUtcIso(slot.end)).getTime();
          return slotStart <= requestedStart && slotEnd >= requestedEnd && slot.available;
        });

        return { available: isFree, checked: true };
      } catch (err) {
        logger.error('Slot validation error', {}, err);
        return { available: true, checked: false, reason: 'validation_error' };
      }
    },
  });
}

/**
 * Generate available time slots for a given date based on working hours
 */
export function generateTimeSlots(date: string, durationMinutes: number = 60): string[] {
  const slots: string[] = [];
  const workStart = 9; // 9 AM
  const workEnd = 18; // 6 PM
  
  for (let hour = workStart; hour < workEnd; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      // Check if slot + duration fits within working hours
      const slotEndHour = hour + Math.floor((minute + durationMinutes) / 60);
      const slotEndMinute = (minute + durationMinutes) % 60;
      
      if (slotEndHour < workEnd || (slotEndHour === workEnd && slotEndMinute === 0)) {
        const slotTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(`${date}T${slotTime}`);
      }
    }
  }
  
  return slots;
}
