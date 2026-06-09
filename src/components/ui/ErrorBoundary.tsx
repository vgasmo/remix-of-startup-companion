import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home, Copy, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { logError, getBreadcrumbs } from '@/lib/logError';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
  copied: boolean;
}

/**
 * Sanitize error message for production display.
 * Never expose stack traces, internal paths, or sensitive data.
 */
function getSafeErrorMessage(error: Error | null, isDev: boolean): string | null {
  if (!error) return null;
  
  // In development, show full message for debugging
  if (isDev) {
    return error.message;
  }
  
  // In production, only show safe generic messages
  // Check for known safe error patterns
  const safePatterns = [
    /network/i,
    /timeout/i,
    /not found/i,
    /unauthorized/i,
    /forbidden/i,
  ];
  
  const message = error.message;
  
  // If it matches a safe pattern, show a sanitized version
  if (safePatterns.some(p => p.test(message))) {
    if (/network/i.test(message)) return 'Erro de rede. Verifique a sua ligação.';
    if (/timeout/i.test(message)) return 'Tempo limite excedido. Tente novamente.';
    if (/not found/i.test(message)) return 'O recurso solicitado não foi encontrado.';
    if (/unauthorized/i.test(message)) return 'Não tem autorização para esta ação.';
    if (/forbidden/i.test(message)) return 'Acesso negado.';
  }
  
  // For all other errors, return null (show generic message only)
  return null;
}

/**
 * Generate a unique error ID for support reference
 */
function generateErrorId(): string {
  return `ERR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorId: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { 
      hasError: true, 
      error,
      errorId: generateErrorId(),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error with structured context using our logging utility
    const loggedError = logError(error, {
      component: 'ErrorBoundary',
      severity: 'critical',
      metadata: {
        componentStack: errorInfo.componentStack,
        breadcrumbs: getBreadcrumbs(),
      },
    });
    
    // Update state with the logged error ID
    this.setState({ errorId: loggedError.errorId });
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith('lazy:'))
        .forEach((key) => sessionStorage.removeItem(key));
    }
    window.location.reload();
  };

  private handleGoHome = () => {
    if (typeof window !== 'undefined') {
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith('lazy:'))
        .forEach((key) => sessionStorage.removeItem(key));
    }
    window.location.assign('/my-workspaces');
  };

  private handleCopyErrorId = async () => {
    if (this.state.errorId) {
      try {
        await navigator.clipboard.writeText(this.state.errorId);
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      } catch {
        // Fallback for older browsers - no-op, clipboard API unavailable
      }
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = import.meta.env.DEV;
      const safeMessage = getSafeErrorMessage(this.state.error, isDev);

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
          <Card className="max-w-md w-full shadow-xl border-destructive/20">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center animate-pulse">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-xl font-heading">
                Ocorreu um erro
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                Pedimos desculpa pelo incómodo. Por favor, tente atualizar a página ou voltar ao início.
              </p>
              
              {/* Error ID for support reference (always safe to show) */}
              {this.state.errorId && (
                <div className="flex items-center justify-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <span className="text-xs text-muted-foreground">
                    Código de erro:
                  </span>
                  <code className="bg-background px-2 py-1 rounded text-xs font-mono">
                    {this.state.errorId}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={this.handleCopyErrorId}
                  >
                    {this.state.copied ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              )}
              
              {/* Only show error details in development or for safe messages */}
              {safeMessage && (
                <details className="text-left bg-muted/30 rounded-lg p-3 text-xs border">
                  <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground transition-colors">
                    {isDev ? 'Detalhes do erro (dev)' : 'Mais informações'}
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-destructive/80 font-mono text-[10px]">
                    {safeMessage}
                  </pre>
                </details>
              )}
            </CardContent>
            <CardFooter className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={this.handleGoHome} className="gap-2">
                <Home className="h-4 w-4" />
                Início
              </Button>
              <Button onClick={this.handleReload} className="gap-2">
                <RefreshCcw className="h-4 w-4" />
                Atualizar
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
