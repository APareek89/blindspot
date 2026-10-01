import { normalizeModelRef, parseModelRef } from "@blindspot/providers";
import { DEFAULT_JUDGE_MODEL, type Provider } from "@blindspot/shared";

/** Env var that holds each provider's key (matches bootstrap's import table). */
const PROVIDER_ENV: Record<Provider, string | null> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  hf: "HF_TOKEN",
  fireworks: "FIREWORKS_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  together: "TOGETHER_API_KEY",
  ollama: null, // local, no key
};

export interface ConfigWarning {
  setting: string;
  model: string;
  provider: string;
  envVar: string;
  message: string;
}

/**
 * FMEA P2 (config drift): a configured model (`BLINDSPOT_DEFAULT_MODEL`, `JUDGE_MODEL`,
 * `GOLDEN_MODEL`) whose provider has no key in the environment can never run — bootstrap
 * won't import a key for it, so routes/evals silently fail. Surface it at startup instead
 * of at first traffic. Returns warnings; the caller decides whether to log or fail.
 */
export function checkModelKeyConfig(): ConfigWarning[] {
  if(process.env.BLINDSPOT_MOCK_MODE==='1')return [];
  const settings: Array<[string, string | undefined]> = [
    ["BLINDSPOT_DEFAULT_MODEL", process.env.BLINDSPOT_DEFAULT_MODEL],
    ["JUDGE_MODEL", process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL],
    ["GOLDEN_MODEL", process.env.GOLDEN_MODEL],
  ];

  const warnings: ConfigWarning[] = [];
  for (const [setting, value] of settings) {
    if (!value) continue;
    let provider: string;
    try {
      provider = parseModelRef(normalizeModelRef(value)).provider;
    } catch {
      warnings.push({
        setting,
        model: value,
        provider: "?",
        envVar: "?",
        message: `${setting}="${value}" is not a valid provider:model ref`,
      });
      continue;
    }
    const envVar = PROVIDER_ENV[provider as Provider];
    if (envVar === null) continue; // local provider, no key needed
    if (!envVar) {
      warnings.push({
        setting,
        model: value,
        provider,
        envVar: "?",
        message: `${setting} uses unknown provider "${provider}"`,
      });
      continue;
    }
    if (!process.env[envVar]) {
      warnings.push({
        setting,
        model: value,
        provider,
        envVar,
        message: `${setting}=${value} needs ${envVar}, which is not set — this model can't run`,
      });
    }
  }
  return warnings;
}
