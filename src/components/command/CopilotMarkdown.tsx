/**
 * Markdown renderer for Copilot answers inside the command palette.
 * Lives in its own module so `react-markdown` (+ unified/micromark) is loaded lazily,
 * only when the Copilot mode of the palette is actually used, instead of in the entry chunk.
 */
import ReactMarkdown from 'react-markdown';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface CopilotMarkdownProps {
  content: string;
  /** Called when the user clicks an in-app link (path starts with a single `/`). */
  onNavigate: (path: string) => void;
}

export default function CopilotMarkdown({ content, onNavigate }: CopilotMarkdownProps) {
  return (
    <ReactMarkdown
      components={{
        a: ({ href, children, ...props }) => {
          const safe = sanitizeUrl(href);
          if (!safe) return <span>{children}</span>;
          const isExternal = safe.startsWith('http');
          return (
            <a
              {...props}
              href={safe}
              target={isExternal ? '_blank' : undefined}
              rel={isExternal ? 'noopener noreferrer' : undefined}
              onClick={(e) => {
                if (!isExternal && safe.startsWith('/')) {
                  e.preventDefault();
                  onNavigate(safe);
                }
              }}
            >
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
