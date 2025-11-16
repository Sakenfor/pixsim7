import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Panel } from '@pixsim7/ui'

interface ReflexMiniGameProps {
  onResult: (success: boolean, score: number) => void
  config?: { rounds?: number; windowMs?: number }
}

export function ReflexMiniGame({ onResult, config }: ReflexMiniGameProps) {
  const rounds = config?.rounds ?? 3
  const windowMs = config?.windowMs ?? 1000
  const [round, setRound] = useState(0)
  const [cue, setCue] = useState(false)
  const [score, setScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [success, setSuccess] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (round >= rounds) return
    const delay = 500 + Math.random() * 1500
    const id = window.setTimeout(() => {
      setCue(true)
      timer.current = window.setTimeout(() => {
        setCue(false)
        setRound(r => r + 1)
      }, windowMs)
    }, delay)
    return () => {
      clearTimeout(id)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [round, rounds, windowMs])

  useEffect(() => {
    if (round >= rounds) {
      const passed = score >= Math.ceil(rounds * 0.6)
      setSuccess(passed)
      setGameOver(true)
      onResult(passed, score)
    }
  }, [round, rounds, score, onResult])

  function hit() {
    if (cue) {
      setScore(s => s + 1)
      setCue(false)
      setRound(r => r + 1)
    }
  }

  return (
    <Panel className="space-y-4">
      <div className="text-center space-y-6 py-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Reflex Challenge</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Hit the button when it turns green!
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <Button
            onClick={hit}
            variant={cue ? 'primary' : 'secondary'}
            disabled={gameOver}
            className={`
              w-48 h-48 text-3xl font-bold rounded-full transition-all duration-200
              ${cue ? 'scale-110 shadow-lg' : ''}
              ${gameOver ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {gameOver ? 'Done!' : cue ? 'HIT!' : 'Wait...'}
          </Button>

          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            Round <span className="font-semibold">{Math.min(round + 1, rounds)}</span> / {rounds}
            <span className="mx-2">·</span>
            Score <span className="font-semibold">{score}</span>
          </div>
        </div>

        {gameOver && (
          <div className={`
            p-4 rounded-lg border-2 transition-all
            ${success
              ? 'bg-green-50 dark:bg-green-900/20 border-green-500 dark:border-green-700'
              : 'bg-red-50 dark:bg-red-900/20 border-red-500 dark:border-red-700'
            }
          `}>
            <div className={`text-lg font-bold ${success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              {success ? '✓ Success!' : '✗ Failed'}
            </div>
            <div className="text-sm mt-1 text-neutral-700 dark:text-neutral-300">
              You scored {score} out of {rounds} ({Math.round((score / rounds) * 100)}%)
              {success ? ' - Well done!' : ` - Need ${Math.ceil(rounds * 0.6)} to pass.`}
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}
