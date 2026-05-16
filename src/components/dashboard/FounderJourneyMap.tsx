import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Lightbulb, Cpu, FlaskConical, TrendingUp, Rocket, Check, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface FounderJourneyMapProps {
  currentStage?: string | null;
}

const JOURNEY_STAGES = [
  { key: 'idea', icon: Lightbulb, i18nKey: 'founder.journeyStages.idea', fallback: 'Ideia', color: 'from-violet-500 to-purple-500' },
  { key: 'mvp', icon: Cpu, i18nKey: 'founder.journeyStages.mvp', fallback: 'MVP', color: 'from-blue-500 to-cyan-500' },
  { key: 'validation', icon: FlaskConical, i18nKey: 'founder.journeyStages.validation', fallback: 'Validação', color: 'from-emerald-500 to-green-500' },
  { key: 'scaling', icon: TrendingUp, i18nKey: 'founder.journeyStages.scaling', fallback: 'Escalamento', color: 'from-amber-500 to-orange-500' },
  { key: 'growth', icon: Rocket, i18nKey: 'founder.journeyStages.growth', fallback: 'Crescimento', color: 'from-rose-500 to-pink-500' },
] as const;

function getStageIndex(stage?: string | null): number {
  if (!stage) return 0;
  const idx = JOURNEY_STAGES.findIndex(s => s.key === stage);
  return idx >= 0 ? idx : 0;
}

export const FounderJourneyMap = memo(function FounderJourneyMap({ currentStage }: FounderJourneyMapProps) {
  const { t } = useTranslation();
  const activeIdx = getStageIndex(currentStage);

  return (
    <Card className="rounded-2xl overflow-hidden border-border/50 bg-gradient-to-r from-muted/20 via-background to-muted/20">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Rocket className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{t('founder.journeyMap', { defaultValue: 'O Seu Percurso' })}</h3>
        </div>

        {/* Journey track */}
        <div className="relative">
          {/* Connector line */}
          <div className="absolute top-5 left-5 right-5 h-0.5 bg-border/50 z-0" />
          <motion.div
            className="absolute top-5 left-5 h-0.5 bg-gradient-to-r from-primary to-primary/60 z-[1]"
            initial={{ width: 0 }}
            animate={{
              width: `${(activeIdx / Math.max(JOURNEY_STAGES.length - 1, 1)) * 100}%`,
            }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
          />

          {/* Nodes */}
          <div className="relative z-10 flex justify-between">
            {JOURNEY_STAGES.map((stage, idx) => {
              const Icon = stage.icon;
              const isCompleted = idx < activeIdx;
              const isCurrent = idx === activeIdx;
              const isLocked = idx > activeIdx;

              return (
                <motion.div
                  key={stage.key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 + 0.2, duration: 0.4 }}
                  className="flex flex-col items-center gap-1.5 flex-1"
                >
                  {/* Node circle */}
                  <motion.div
                    className={cn(
                      'h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all duration-300',
                      isCompleted && `bg-gradient-to-br ${stage.color} border-transparent shadow-lg`,
                      isCurrent && `bg-gradient-to-br ${stage.color} border-transparent shadow-lg shadow-primary/30 ring-4 ring-primary/20`,
                      isLocked && 'bg-muted/60 border-border/50',
                    )}
                    whileHover={!isLocked ? { scale: 1.1 } : undefined}
                    animate={isCurrent ? { scale: [1, 1.05, 1] } : undefined}
                    transition={isCurrent ? { repeat: Infinity, duration: 2.5 } : undefined}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4 text-white" strokeWidth={3} />
                    ) : isLocked ? (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                    ) : (
                      <Icon className="h-4 w-4 text-white" />
                    )}
                  </motion.div>

                  {/* Label */}
                  <span className={cn(
                    'text-[10px] sm:text-xs font-medium text-center leading-tight',
                    isCurrent && 'text-foreground font-semibold',
                    isCompleted && 'text-foreground/80',
                    isLocked && 'text-muted-foreground/50',
                  )}>
                    {t(`stages.${stage.key}`, stage.label)}
                  </span>

                  {/* Current indicator */}
                  {isCurrent && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.8 }}
                      className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full"
                    >
                      {t('founder.youAreHere', { defaultValue: 'You are here' })}
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
