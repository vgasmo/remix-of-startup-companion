import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Circle, AtSign, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface Presence {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  isTyping: boolean;
}

interface MentionSuggestion {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface CollaborativeNotesEditorProps {
  value: string;
  onChange: (value: string) => void;
  workspaceId: string;
  sessionId: string;
  placeholder?: string;
  readOnly?: boolean;
  members?: Array<{
    user_id: string;
    profile: {
      id: string;
      email: string;
      full_name: string | null;
      avatar_url: string | null;
    } | null;
  }>;
}

const PRESENCE_COLORS = [
  'bg-[hsl(var(--info))]',
  'bg-[hsl(var(--success))]',
  'bg-primary/10',
  'bg-[hsl(var(--warning))]/10',
  'bg-primary/10',
  'bg-[hsl(var(--info))]/10',
];

export function CollaborativeNotesEditor({
  value,
  onChange,
  workspaceId,
  sessionId,
  placeholder = 'Add notes...',
  readOnly = false,
  members = [],
}: CollaborativeNotesEditorProps) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [presences, setPresences] = useState<Presence[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [cursorPosition, setCursorPosition] = useState(0);
  
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get color for user
  const getUserColor = useCallback((userId: string) => {
    const index = userId.charCodeAt(0) % PRESENCE_COLORS.length;
    return PRESENCE_COLORS[index];
  }, []);

  // Setup presence channel
  useEffect(() => {
    if (!user || !sessionId) return;

    const channelName = `session-notes:${sessionId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const otherPresences: Presence[] = [];
        
        Object.entries(state).forEach(([key, value]) => {
          if (key !== user.id && Array.isArray(value) && value.length > 0) {
            const presence = value[0] as any;
            otherPresences.push({
              id: key,
              name: presence.name || 'Unknown',
              avatar: presence.avatar,
              color: getUserColor(key),
              isTyping: presence.isTyping || false,
            });
          }
        });
        
        setPresences(otherPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            name: profile?.full_name || profile?.email || 'Anonymous',
            avatar: profile?.avatar_url,
            isTyping: false,
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [user, sessionId, profile, getUserColor]);

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    if (!channelRef.current || !user) return;

    // Update presence to show typing
    channelRef.current.track({
      name: profile?.full_name || profile?.email || 'Anonymous',
      avatar: profile?.avatar_url,
      isTyping: true,
    });

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      if (channelRef.current) {
        channelRef.current.track({
          name: profile?.full_name || profile?.email || 'Anonymous',
          avatar: profile?.avatar_url,
          isTyping: false,
        });
      }
    }, 2000);
  }, [user, profile]);

  // Handle @ mention detection
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    setCursorPosition(cursorPos);
    
    onChange(newValue);
    handleTyping();

    // Check for @ mention trigger
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      // Check if we're in the middle of typing a mention
      if (!textAfterAt.includes(' ') && textAfterAt.length <= 20) {
        setMentionQuery(textAfterAt.toLowerCase());
        setShowMentions(true);
        
        // Position the popover
        if (textareaRef.current) {
          const rect = textareaRef.current.getBoundingClientRect();
          setMentionPosition({
            top: rect.top + 30,
            left: rect.left + 10,
          });
        }
        return;
      }
    }
    
    setShowMentions(false);
  }, [onChange, handleTyping]);

  // Filter members for mention suggestions
  const mentionSuggestions: MentionSuggestion[] = members
    .filter(m => m.profile && m.user_id !== user?.id)
    .filter(m => {
      if (!mentionQuery) return true;
      const name = m.profile?.full_name?.toLowerCase() || '';
      const email = m.profile?.email?.toLowerCase() || '';
      return name.includes(mentionQuery) || email.includes(mentionQuery);
    })
    .slice(0, 5)
    .map(m => ({
      id: m.user_id,
      name: m.profile?.full_name || m.profile?.email?.split('@')[0] || 'Unknown',
      email: m.profile?.email || '',
      avatar: m.profile?.avatar_url || undefined,
    }));

  // Insert mention
  const insertMention = useCallback((suggestion: MentionSuggestion) => {
    const textBeforeCursor = value.slice(0, cursorPosition);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const textAfterCursor = value.slice(cursorPosition);
    
    const mentionText = `@${suggestion.name.replace(/\s+/g, '.')} `;
    const newValue = value.slice(0, atIndex) + mentionText + textAfterCursor;
    
    onChange(newValue);
    setShowMentions(false);
    
    // Focus and position cursor after mention
    if (textareaRef.current) {
      const newCursorPos = atIndex + mentionText.length;
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
  }, [value, cursorPosition, onChange]);

  // Render presence indicators
  const typingUsers = presences.filter(p => p.isTyping);
  const activeUsers = presences.filter(p => !p.isTyping);

  return (
    <div className="space-y-2">
      {/* Presence bar */}
      {presences.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          <div className="flex items-center gap-1">
            {presences.slice(0, 5).map((presence) => (
              <Popover key={presence.id}>
                <PopoverTrigger asChild>
                  <button className="relative">
                    <Avatar className={cn('h-6 w-6 ring-2', presence.color.replace('bg-', 'ring-'))}>
                      <AvatarImage src={presence.avatar} />
                      <AvatarFallback className="text-xs">
                        {presence.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {presence.isTyping && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-[hsl(var(--success))] animate-pulse" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{presence.name}</span>
                    {presence.isTyping && (
                      <Badge variant="secondary" className="text-xs">
                        {t('sessions.typing')}
                      </Badge>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            ))}
            {presences.length > 5 && (
              <Badge variant="secondary" className="text-xs">
                +{presences.length - 5}
              </Badge>
            )}
          </div>
          {typingUsers.length > 0 && (
            <span className="italic">
              {typingUsers.length === 1
                ? `${typingUsers[0].name} ${t('sessions.isTyping')}`
                : `${typingUsers.length} ${t('sessions.peopleTyping')}`}
            </span>
          )}
        </div>
      )}

      {/* Textarea with mentions */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          readOnly={readOnly}
          rows={10}
          className="resize-y min-h-[180px]"
        />
        
        {/* Mention suggestions dropdown */}
        {showMentions && mentionSuggestions.length > 0 && (
          <div 
            className="absolute z-50 mt-1 w-64 rounded-md border bg-popover p-1 shadow-md"
            style={{ top: '100%', left: 0 }}
          >
            <div className="text-xs text-muted-foreground px-2 py-1 flex items-center gap-1">
              <AtSign className="h-3 w-3" />
              {t('sessions.mentionSomeone')}
            </div>
            {mentionSuggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-left"
                onClick={() => insertMention(suggestion)}
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={suggestion.avatar} />
                  <AvatarFallback className="text-xs">
                    {suggestion.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{suggestion.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{suggestion.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Help text */}
      <p className="text-xs text-muted-foreground">
        {t('sessions.mentionHint')}
      </p>
    </div>
  );
}
