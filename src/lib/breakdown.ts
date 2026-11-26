// Ask the configured model to break a goal into milestones and tasks.
// Returns suggestions only; the user picks which ones to add.
import { streamChat } from './llm';
import type { Settings } from './settings';
import { todayStr } from './plan';

export interface SuggestedMilestone {
  title: string;
  dueDate: string;
  tasks: string[];
}

export async function suggestBreakdown(
  settings: Settings,
  goal: { title: string; why: string; targetDate: string },
  bucketName: string,
  existing: string[],
  onProgress: (text: string) => void,
): Promise<SuggestedMilestone[]> {
  const prompt = [
    `Today is ${todayStr()}.`,
    `Area of life: ${bucketName}`,
    `Goal: ${goal.title}`,
    goal.why ? `Why it matters: ${goal.why}` : '',
    goal.targetDate ? `Target date: ${goal.targetDate}` : 'No target date set.',
    existing.length ? `Already planned (don't repeat): ${existing.join('; ')}` : '',
    '',
    'Break this goal into 3 to 5 milestones in order. Each milestone gets 2 to 5 concrete next-action tasks that each take under 2 hours.',
    'If there is a target date, spread milestone due dates between today and it. Otherwise leave dueDate empty.',
    'Reply with ONLY JSON, no other text, in this exact shape:',
    '[{"title":"milestone","dueDate":"YYYY-MM-DD or empty","tasks":["task","task"]}]',
  ]
    .filter(Boolean)
    .join('\n');

  let out = '';
  await streamChat(
    settings,
    [
      { role: 'system', content: 'You are a planning assistant. You output only valid JSON.' },
      { role: 'user', content: prompt },
    ],
    (t) => {
      out += t;
      onProgress(out);
    },
    (p) => onProgress(p.text),
  );
  return parse(out);
}

function parse(text: string): SuggestedMilestone[] {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error("The model didn't return a plan. Try again, or use a cloud model.");
  const raw = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(raw)) throw new Error('Unexpected reply format.');
  return raw
    .filter((m) => m && typeof m.title === 'string')
    .map((m) => ({
      title: m.title.trim(),
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(m.dueDate ?? '') ? m.dueDate : '',
      tasks: Array.isArray(m.tasks) ? m.tasks.filter((t: unknown) => typeof t === 'string' && t.trim()).map((t: string) => t.trim()) : [],
    }));
}
