import type { AISettings, TagType, TransactionType } from "@/types";

export interface ParsedTransaction {
  type: TransactionType;
  amount: number;
  category: string;
  date: string;
  merchant: string;
  notes: string;
  tag: TagType;
  confidence: number;
  missingFields: string[];
}

export interface PreviewRow {
  type: TransactionType;
  amount: number;
  category: string;
  date: string;
  merchant: string;
  notes: string;
  tag: TagType;
  account: string;
  isDuplicate?: boolean;
  selected: boolean;
}

function buildParsePrompt(
  text: string,
  categories: { name: string; type: string; tag: string }[],
  today: string
): string {
  const inflowCats = categories.filter((c) => c.type === "inflow").map((c) => c.name).join(", ");
  const outflowCats = categories.filter((c) => c.type === "outflow").map((c) => c.name).join(", ");

  return `You are a financial transaction parser. Parse the following user input into a structured transaction.

Today's date is: ${today}

Available inflow categories: ${inflowCats}
Available outflow categories: ${outflowCats}

User input: "${text}"

Rules:
- Determine if this is an "inflow" (money coming in) or "outflow" (money going out).
- Extract the amount as a positive number.
- Map to the closest matching category from the available categories.
- Resolve relative dates (yesterday, today, last week, etc.) to YYYY-MM-DD format.
- Extract merchant/payee/store/source if mentioned (e.g., "Starbucks", "Amazon", "Employer").
- Extract notes as a short concise description/purpose of what was purchased or reason (e.g., "Dinner with team", "Groceries", "March Salary").
- Determine the tag: "Need", "Want", "Invest", or "Transfer".
- If you cannot confidently determine a required field (type, amount, category, date), list it in missingFields.
- Set confidence from 0 to 1 based on how certain you are.

Respond ONLY with valid JSON in this exact format:
{
  "type": "inflow" | "outflow",
  "amount": number,
  "category": "category name",
  "date": "YYYY-MM-DD",
  "merchant": "merchant name or empty",
  "notes": "description / purpose or empty",
  "tag": "Need" | "Want" | "Invest" | "Transfer",
  "confidence": number,
  "missingFields": ["field names that need user input"]
}`;
}

function buildImportPrompt(
  rows: string[],
  categories: { name: string; type: string; tag: string }[],
  today: string
): string {
  const inflowCats = categories.filter((c) => c.type === "inflow").map((c) => c.name).join(", ");
  const outflowCats = categories.filter((c) => c.type === "outflow").map((c) => c.name).join(", ");

  return `You are a financial statement import assistant. Convert the following bank statement rows into structured transactions.

Today's date is: ${today}

Available inflow categories: ${inflowCats}
Available outflow categories: ${outflowCats}

Bank statement rows:
${rows.join("\n")}

Rules:
- For each row, determine if it's an "inflow" or "outflow" based on the amount sign or description.
- Extract the amount as a positive number.
- Map to the closest matching category from the available categories.
- Convert dates to YYYY-MM-DD format.
- Extract merchant/payee from the description.
- Determine the tag: "Need", "Want", "Invest", or "Transfer".
- Set confidence from 0 to 1.
- If a row cannot be confidently parsed, set missingFields accordingly.

Respond ONLY with valid JSON array in this exact format:
[
  {
    "type": "inflow" | "outflow",
    "amount": number,
    "category": "category name",
    "date": "YYYY-MM-DD",
    "merchant": "merchant name or empty",
    "notes": "any notes or empty",
    "tag": "Need" | "Want" | "Invest" | "Transfer",
    "confidence": number,
    "missingFields": []
  }
]`;
}

function extractJSON<T>(text: string): T {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const firstBrace = cleaned.indexOf(cleaned.startsWith("[") ? "[" : "{");
  const lastBrace = cleaned.lastIndexOf(cleaned.startsWith("[") ? "]" : "}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

async function callGemini(apiKey: string, prompt: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API error (${resp.status}): ${err}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  return text;
}

async function callGroq(apiKey: string, prompt: string, model: string): Promise<string> {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Groq API error (${resp.status}): ${err}`);
  }
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned no content");
  return text;
}

async function callOpenAI(apiKey: string, prompt: string, model: string): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API error (${resp.status}): ${err}`);
  }
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI returned no content");
  return text;
}

async function callAnthropic(apiKey: string, prompt: string, model: string): Promise<string> {
  const url = "https://api.anthropic.com/v1/messages";
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "dangerously-allow-browser": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic API error (${resp.status}): ${err}`);
  }
  const data = await resp.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("Anthropic returned no content");
  return text;
}

async function callAI(settings: AISettings, prompt: string): Promise<string> {
  const models: Record<string, string> = {
    gemini: settings.model || "gemini-1.5-flash",
    groq: settings.model || "llama-3.3-70b-versatile",
    openai: settings.model || "gpt-4o-mini",
    anthropic: settings.model || "claude-3-5-sonnet-20241022",
  };
  const model = models[settings.provider];

  switch (settings.provider) {
    case "gemini":
      return callGemini(settings.apiKey, prompt, model);
    case "groq":
      return callGroq(settings.apiKey, prompt, model);
    case "openai":
      return callOpenAI(settings.apiKey, prompt, model);
    case "anthropic":
      return callAnthropic(settings.apiKey, prompt, model);
    default:
      throw new Error(`Unsupported provider: ${settings.provider}`);
  }
}

export async function parseTransactionWithAI(
  input: string,
  categories: { name: string; type: string; tag: string }[],
  today: string,
  aiSettings: AISettings
): Promise<ParsedTransaction> {
  const prompt = buildParsePrompt(input, categories, today);
  const rawResponse = await callAI(aiSettings, prompt);
  return extractJSON<ParsedTransaction>(rawResponse);
}

export async function importTransactionsWithAI(
  rows: string[],
  categories: { name: string; type: string; tag: string }[],
  today: string,
  aiSettings: AISettings
): Promise<PreviewRow[]> {
  const prompt = buildImportPrompt(rows.slice(0, 100), categories, today);
  const rawResponse = await callAI(aiSettings, prompt);
  return extractJSON<PreviewRow[]>(rawResponse);
}
