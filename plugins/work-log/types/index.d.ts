export type Job = { name: string; state: string; detail: string }
export type Progress = { percent: number; label: string; jobs?: Job[] }
export type Phase = { name: string; state: 'done' | 'doing' | 'todo'; note?: string; since?: number }
export type Stat = { label: string; value: string | number }
export type Plan = { goal: string; phases: Phase[]; total?: number; done?: number; unit?: string; stats?: Stat[]; small?: boolean; win?: string; you?: string; updated?: number; session?: string; tasksDone?: number }
export type Event = { at: number; who: string; tool: string; detail: string }
export type AgentRow = { id: string; type: string; description: string; status: string }
export type Activity = { tool: string; detail: string; count: number }

declare module 'claude-code' {
  interface PluginState {
    'work-log': {
      progress: Progress | null
      plan: Plan | null
      agents: AgentRow[]
      activity: Record<string, Activity>
      feed: Event[]
      cleared: string[]
      timer: { mins: number; endsAt: number | null; now: number }
      tally: { counts: Record<string, number>; now: { text: string; kind: string; detail: string } | null }
      focus: boolean
    }
  }
}
