import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Clock, Check, X, Loader2, MessageSquare } from 'lucide-react';
import { format, addDays, isBefore, startOfDay } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { notify } from "@/lib/notify";
import { 
  useMentorAvailability, 
  useMyBookings, 
  useCreateBooking, 
  useUpdateBookingStatus,
  MentorBooking 
} from '@/hooks/useMentorAvailability';

interface MentorBookingPanelProps {
  mentorId?: string;
  mentorName?: string;
  mentorAvatar?: string;
  workspaceId?: string;
  mode: 'founder' | 'mentor';
}

const DAYS_OF_WEEK_PT: Record<number, string> = {
  0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado'
};
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minToTime(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}

export function MentorBookingPanel({ 
  mentorId, 
  mentorName, 
  mentorAvatar, 
  workspaceId,
  mode 
}: MentorBookingPanelProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [message, setMessage] = useState('');
  const [showBookingForm, setShowBookingForm] = useState(false);

  const { data: availability, isLoading: loadingAvailability } = useMentorAvailability(mentorId);
  const { data: bookings, isLoading: loadingBookings } = useMyBookings();
  const createBooking = useCreateBooking();
  const updateStatus = useUpdateBookingStatus();

  const getInitials = (name: string | null) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  // Generate 60-min slots inside each availability window, excluding those
  // that overlap with existing accepted bookings for this mentor.
  const SLOT_MIN = 60;
  const getAvailableSlotsForDate = (date: Date) => {
    const dayOfWeek = date.getDay();
    const windows = availability?.filter(a => a.day_of_week === dayOfWeek) || [];
    if (!windows.length) return [] as { start: string; end: string; key: string }[];

    const dateStr = format(date, 'yyyy-MM-dd');
    const busy = (bookings || [])
      .filter(b =>
        b.mentor_id === mentorId &&
        b.requested_date === dateStr &&
        (b.status === 'accepted' || b.status === 'pending'),
      )
      .map(b => ({
        s: timeToMin(b.requested_start_time),
        e: timeToMin(b.requested_end_time),
      }));

    const slots: { start: string; end: string; key: string }[] = [];
    for (const w of windows) {
      let cursor = timeToMin(w.start_time);
      const end = timeToMin(w.end_time);
      while (cursor + SLOT_MIN <= end) {
        const slotStart = cursor;
        const slotEnd = cursor + SLOT_MIN;
        const clash = busy.some(b => slotStart < b.e && slotEnd > b.s);
        if (!clash) {
          const startStr = minToTime(slotStart);
          const endStr = minToTime(slotEnd);
          slots.push({ start: startStr, end: endStr, key: `${startStr}-${endStr}` });
        }
        cursor += SLOT_MIN;
      }
    }
    return slots;
  };

  const isDateAvailable = (date: Date) => {
    if (isBefore(date, startOfDay(new Date()))) return false;
    const dayOfWeek = date.getDay();
    return availability?.some(a => a.day_of_week === dayOfWeek) || false;
  };

  const handleBookSession = () => {
    if (!selectedDate || !selectedSlot || !mentorId) {
      notify.error(t('mentors.selectDateAndSlot', 'Please select a date and time slot'));
      return;
    }

    const [startTime, endTime] = selectedSlot.split('-');

    createBooking.mutate({
      mentor_id: mentorId,
      workspace_id: workspaceId,
      requested_date: format(selectedDate, 'yyyy-MM-dd'),
      requested_start_time: startTime,
      requested_end_time: endTime,
      message: message.trim() || undefined,
    }, {
      onSuccess: () => {
        notify.success(t('mentors.bookingRequestSent', 'Booking request sent!'));
        setShowBookingForm(false);
        setSelectedDate(undefined);
        setSelectedSlot('');
        setMessage('');
      },
      onError: (error: any) => {
        // The database trigger `prevent_mentor_booking_overlap` raises a
        // 23505 error when another founder has just booked the same slot.
        const msg = String(error?.message ?? '');
        if (msg.includes('mentor_double_booking') || error?.code === '23505') {
          notify.error(t('mentors.slotAlreadyTaken', {
            defaultValue: 'That slot was just booked by someone else — please pick another one.',
          }));
        } else {
          notify.error(msg || t('mentors.failedToCreateBooking', 'Failed to create booking'));
        }
      },
    });
  };

  const handleUpdateStatus = (booking: MentorBooking, status: 'accepted' | 'declined') => {
    updateStatus.mutate({ id: booking.id, status }, {
      onSuccess: () => {
        const statusText = status === 'accepted' 
          ? t('mentors.bookingAccepted', 'Booking accepted') 
          : t('mentors.bookingDeclined', 'Booking declined');
        notify.success(statusText);
      },
      onError: (error: any) => {
        notify.error(error.message || t('mentors.failedToUpdateBooking', 'Failed to update booking'));
      },
    });
  };

  const pendingBookings = bookings?.filter(b => b.status === 'pending') || [];
  const confirmedBookings = bookings?.filter(b => b.status === 'accepted') || [];
  const myMentorBookings = bookings?.filter(b => 
    mode === 'founder' ? b.mentor_id === mentorId : true
  ) || [];

  if (mode === 'founder' && mentorId) {
    // Founder view: Book a session with specific mentor
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={mentorAvatar || undefined} />
              <AvatarFallback>{getInitials(mentorName || null)}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{t('mentors.bookSessionWith', { name: mentorName })}</CardTitle>
              <CardDescription>{t('mentors.selectAvailableSlot')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingAvailability ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : !availability?.length ? (
            <div className="text-center py-6 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t('mentors.noAvailabilityYet')}</p>
            </div>
          ) : showBookingForm ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('mentors.selectDate')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <Calendar className="h-4 w-4 mr-2" />
                      {selectedDate ? format(selectedDate, 'PPP') : t('mentors.pickDate')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) => !isDateAvailable(date)}
                      fromDate={new Date()}
                      toDate={addDays(new Date(), 60)}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {selectedDate && (
                <div className="space-y-2">
                  <Label>{t('mentors.selectTimeSlot')}</Label>
                  <Select value={selectedSlot} onValueChange={setSelectedSlot}>
                    <SelectTrigger aria-label={t('mentors.selectTimeSlot')}>
                      <SelectValue placeholder={t('mentors.chooseTimeSlot')} />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableSlotsForDate(selectedDate).map(slot => (
                        <SelectItem key={slot.key} value={slot.key}>
                          {slot.start.slice(0, 5)} - {slot.end.slice(0, 5)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>{t('mentors.messageOptional')}</Label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('mentors.whatToDiscuss')}
                  rows={3}
                  aria-label={t('mentors.messageOptional')}
                />
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowBookingForm(false)} 
                  className="flex-1"
                >
                  {t('common.cancel')}
                </Button>
                <Button 
                  onClick={handleBookSession} 
                  disabled={!selectedDate || !selectedSlot || createBooking.isPending} loading={createBooking.isPending}
                  className="flex-1"
                >
                  {createBooking.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {t('mentors.requestBooking')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">{t('mentors.availableOn')}</p>
                <div className="flex flex-wrap gap-2">
                  {[...new Set(availability.map(a => a.day_of_week))].sort().map(day => (
                    <Badge key={day} variant="secondary">
                      {DAYS_OF_WEEK_PT[day] || DAYS_OF_WEEK[day]}
                    </Badge>
                  ))}
                </div>
              </div>

              <Button onClick={() => setShowBookingForm(true)} className="w-full">
                <Calendar className="h-4 w-4 mr-2" />
                {t('mentors.scheduleSession')}
              </Button>

              {/* Show existing bookings with this mentor */}
              {myMentorBookings.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">{t('mentors.yourBookings')}</p>
                  <div className="space-y-2">
                    {myMentorBookings.map(booking => (
                      <div key={booking.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
                        <div>
                          <span>{format(new Date(booking.requested_date), 'MMM d')}</span>
                          <span className="text-muted-foreground ml-2">
                            {booking.requested_start_time.slice(0, 5)}
                          </span>
                        </div>
                        <Badge variant={
                          booking.status === 'accepted' ? 'default' :
                          booking.status === 'declined' ? 'destructive' : 'secondary'
                        }>
                          {booking.status === 'accepted' ? t('mentors.confirmed', 'Confirmado') :
                           booking.status === 'declined' ? t('mentors.declined', 'Recusado') :
                           t('mentors.pending', 'Pendente')}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Mentor view: See and manage incoming booking requests
  return (
    <div className="space-y-6">
      {/* Pending Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('mentors.pendingRequests')}
            {pendingBookings.length > 0 && (
              <Badge>{pendingBookings.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingBookings ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : pendingBookings.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t('mentors.noPendingRequests')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingBookings.map(booking => (
                <div key={booking.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={booking.founder?.avatar_url || undefined} />
                    <AvatarFallback>{getInitials(booking.founder?.full_name || null)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{booking.founder?.full_name || booking.founder?.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(booking.requested_date), 'EEEE, MMMM d')} {t('common.atTime', 'às')}{' '}
                      {booking.requested_start_time.slice(0, 5)}
                    </p>
                    {booking.message && (
                      <p className="text-sm mt-1 text-muted-foreground italic">
                        "{booking.message}"
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleUpdateStatus(booking, 'declined')}
                      disabled={updateStatus.isPending} loading={updateStatus.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => handleUpdateStatus(booking, 'accepted')}
                      disabled={updateStatus.isPending} loading={updateStatus.isPending}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmed Bookings */}
      {confirmedBookings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-primary" />
              {t('mentors.confirmedSessions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {confirmedBookings.map(booking => (
                <div key={booking.id} className="flex items-center gap-3 p-2 bg-primary/10 rounded-lg">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={booking.founder?.avatar_url || undefined} />
                    <AvatarFallback>{getInitials(booking.founder?.full_name || null)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{booking.founder?.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(booking.requested_date), 'MMM d')} {t('common.atTime', 'às')} {booking.requested_start_time.slice(0, 5)}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-primary">{t('mentors.confirmed')}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
