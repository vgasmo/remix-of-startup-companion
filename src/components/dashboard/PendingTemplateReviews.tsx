import { FileText, ChevronRight, Clock, AlertCircle, LayoutGrid } from 'lucide-react';
import { clickableProps } from '@/lib/clickable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { usePendingTemplateReviews } from '@/hooks/useTemplates';
import { formatDistanceToNow } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { getCanvasType } from '@/components/workspace/CanvasTemplate';

interface PendingTemplateReviewsProps {
  showEmpty?: boolean;
}

export function PendingTemplateReviews({ showEmpty = false }: PendingTemplateReviewsProps) {
  const navigate = useNavigate();
  const { data: pendingReviews, isLoading } = usePendingTemplateReviews();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!pendingReviews?.length) {
    if (!showEmpty) return null;
    
    return (
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Templates Pending Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No templates awaiting review
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleNavigate = (workspaceId: string, templateName?: string) => {
    const canvasType = templateName ? getCanvasType(templateName) : null;
    if (canvasType) {
      navigate(`/workspace/${workspaceId}?tab=templates&canvas=${canvasType}`);
    } else {
      navigate(`/workspace/${workspaceId}?tab=templates`);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          Templates Pending Review
          <Badge variant="secondary" className="ml-auto bg-amber-100 text-amber-700">
            {pendingReviews.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {pendingReviews.slice(0, 5).map((review) => {
          const templateName = (review.template as any)?.name || 'Template';
          const isCanvas = !!getCanvasType(templateName);
          
          return (
            <div
              key={review.id}
              className="flex items-center justify-between p-3 bg-background rounded-lg border hover:border-primary/50 cursor-pointer transition-colors"
              {...clickableProps(() => handleNavigate(review.workspace_id, templateName))}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-md bg-amber-100 dark:bg-amber-900/30">
                  {isCanvas ? (
                    <LayoutGrid className="h-4 w-4 text-amber-600" />
                  ) : (
                    <FileText className="h-4 w-4 text-amber-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {templateName}
                    {isCanvas && <Badge variant="outline" className="ml-2 text-xs">Canvas</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {(review.workspace as any)?.startup?.name || 'Unknown Startup'} • 
                    <span className="ml-1">
                      {formatDistanceToNow(new Date(review.updated_at), { 
                        addSuffix: true, 
                        locale: enUS 
                      })}
                    </span>
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
        
        {pendingReviews.length > 5 && (
          <p className="text-xs text-center text-muted-foreground pt-2">
            +{pendingReviews.length - 5} more pending reviews
          </p>
        )}
      </CardContent>
    </Card>
  );
}
