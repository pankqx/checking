import { isCrisis, type Insight } from './analysis'

// The companion. Two brains:
//  1. A rule-based responder that always works, offline, instantly.
//  2. An optional on-device LLM (Qwen2.5 1.5B via WebLLM / WebGPU) that only
//     rephrases computed findings. It never invents numbers.

export const HELPLINE =
  "You matter, and you don't have to hold this alone. Please talk to someone right now: Tele-MANAS 14416 (free, 24×7), emergency 112, or your campus counsellor. If you can, tell one person near you how you're feeling."

export interface Context {
  name?: string
  insights: Insight[]
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

export function ruleReply(text: string, ctx: Context): string {
  const t = text.toLowerCase()
  const name = ctx.name ? `, ${ctx.name}` : ''
  if (isCrisis(text)) return HELPLINE
  if (/what changed|why|pattern|insight|how am i/.test(t)) {
    const top = ctx.insights.filter((i) => i.id !== 'steady' && i.id !== 'learning' && i.id !== 'mood-up')
    if (!top.length) return `Nothing stands out against your normal right now${name}. That's a good sign. Want to do a quick check-in so I can keep learning you?`
    return top.map((i) => `• ${i.body} (${i.proof.toLowerCase()})`).join('\n') + '\n\nNone of this is a diagnosis, just your own data, gently compared with you.'
  }
  if (/exam|deadline|assignment|lab|due|work|study|pressure/.test(t)) {
    const p = ctx.insights.find((i) => i.id === 'pressure')
    return p
      ? `${p.title}. ${p.body} One trick: pick the smallest piece of the biggest task and do just 15 minutes. Want me to open the Pressure Release room first?`
      : pick([
          "Deadlines can feel like a crowd standing on your chest. Let's shrink it: what's the one task that would make tomorrow feel lighter?",
          'Try writing every task down in the planner, even small ones. Seeing it all usually makes it smaller than it feels.',
        ])
  }
  if (/sleep|tired|exhausted|insomnia|awake/.test(t)) {
    const s = ctx.insights.find((i) => i.id === 'sleep')
    return s
      ? `${s.title}. ${s.body} Tonight, maybe a screens-down 20 minutes before bed? The Meditation room has a 4-7-8 breath that helps some people drift off.`
      : "Rest is part of studying, not a break from it. If your mind is busy at night, try the 4-7-8 breath in the Meditation room."
  }
  if (/sad|lonely|alone|cry|low|down|empty/.test(t))
    return pick([
      `That sounds heavy${name}. Thank you for telling me. Do you want to talk about it, or would a small distraction help more right now?`,
      "I'm here. Low days happen and they pass, even when it doesn't feel like it. Is there someone you trust you could message today?",
    ])
  if (/angry|frustrat|annoy|hate|irritat/.test(t))
    return 'That frustration is real. The Pressure Release room has a worry shredder and bubble wrap, made exactly for this. Or just vent here, I won\'t judge.'
  if (/anxious|anxiety|panic|nervous|scared|worried/.test(t))
    return "Let's slow the body down first. Breathe in for 4, hold for 4, out for 6. Do it three times with me. Then tell me what the worry is, in one sentence."
  if (/happy|good|great|amazing|excited|proud/.test(t))
    return pick([`Love that${name}! What made today good? Saving it as a gratitude note might feel nice later.`, "That's lovely to hear. Notice it, let it land. 🌼"])
  if (/hi|hello|hey|namaste/.test(t)) return `Hey${name} 👋 How's your mind today, in one word?`
  if (/thank/.test(t)) return 'Always. I\'m right here whenever you need.'
  return pick([
    'Tell me more. I\'m listening.',
    'Mm. How does that sit in your body right now: tight, heavy, buzzy, or okay?',
    'I hear you. If it helps, you can also ask me “what changed?” and I\'ll show you your own patterns.',
  ])
}

/* ---------------- optional on-device LLM ---------------- */

export const MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
type Engine = { chat: { completions: { create: (o: unknown) => Promise<{ choices: { message: { content: string } }[] }> } } }
let engine: Engine | null = null

export const webgpuSupported = () => typeof navigator !== 'undefined' && 'gpu' in navigator
export const llmReady = () => engine != null

export async function loadLLM(onProgress: (p: number, text: string) => void) {
  const webllm = await import('@mlc-ai/web-llm')
  engine = (await webllm.CreateMLCEngine(MODEL_ID, {
    initProgressCallback: (r: { progress: number; text: string }) => onProgress(r.progress, r.text),
  })) as unknown as Engine
}

export async function llmReply(history: { role: 'me' | 'mirror'; text: string }[], ctx: Context): Promise<string> {
  const last = history[history.length - 1]?.text ?? ''
  if (isCrisis(last)) return HELPLINE
  if (!engine) return ruleReply(last, ctx)
  const facts = ctx.insights.map((i) => `- ${i.body} [evidence: ${i.proof}]`).join('\n')
  const sys = `You are Mirror, a warm, brief well-being companion for a college student${ctx.name ? ` named ${ctx.name}` : ''} in India.
Rules: never diagnose; never invent numbers; only use the facts below; 2-4 short sentences; suggest one small next step; if they mention self-harm, give Tele-MANAS 14416 and 112.
Facts computed from their own data:
${facts || '- No notable changes vs their normal.'}`
  const res = await engine.chat.completions.create({
    messages: [{ role: 'system', content: sys }, ...history.slice(-8).map((m) => ({ role: m.role === 'me' ? 'user' : 'assistant', content: m.text }))],
    temperature: 0.6,
    max_tokens: 180,
  })
  return res.choices[0]?.message.content?.trim() || ruleReply(last, ctx)
}
