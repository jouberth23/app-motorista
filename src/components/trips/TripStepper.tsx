import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface Step {
  label: string
  description?: string
}

interface TripStepperProps {
  steps: Step[]
  currentStep: number
  completedSteps: number[]
}

export function TripStepper({ steps, currentStep, completedSteps }: TripStepperProps) {
  return (
    <div className="w-full">
      {/* Mobile: progress bar */}
      <div className="flex items-center justify-between mb-1 sm:hidden">
        <span className="text-xs text-muted-foreground">
          Etapa {currentStep + 1} de {steps.length}
        </span>
        <span className="text-xs font-medium text-primary">{steps[currentStep]?.label}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4 sm:hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* Desktop: step indicators */}
      <div className="hidden sm:flex items-center w-full mb-8">
        {steps.map((step, i) => {
          const isCompleted = completedSteps.includes(i)
          const isCurrent = i === currentStep
          const isPast = i < currentStep

          return (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-200',
                    isCurrent &&
                      'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30',
                    isCompleted || isPast
                      ? 'border-primary/60 bg-primary/20 text-primary'
                      : !isCurrent && 'border-border bg-muted text-muted-foreground',
                  )}
                >
                  {isCompleted || isPast ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={cn(
                    'text-[10px] mt-1 font-medium whitespace-nowrap',
                    isCurrent ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-px mx-2 mb-5 transition-colors duration-300',
                    i < currentStep ? 'bg-primary/60' : 'bg-border',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
