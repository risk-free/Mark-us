/**
 * LLM gateway (D-04): OpenAI-compatible router with primary + fallback.
 * Primary: mainland-China provider (DeepSeek / GLM / Kimi K3) for latency & data
 * residency; fallback configured independently. Embeddings: self-hosted BGE.
 * Client PII is NEVER sent to third-party models (D-04).
 * Implementation lands in P5 (scoring) / P6 (copy & OA analysis).
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  json?: boolean;
  maxTokens?: number;
}

export interface GatewayConfig {
  primary: { baseUrl: string; apiKey: string; model: string };
  fallback?: { baseUrl: string; apiKey: string; model: string };
  embedUrl?: string;
}

export function configFromEnv(): GatewayConfig {
  const required = (k: string): string => process.env[k] ?? "";
  return {
    primary: {
      baseUrl: required("LLM_PRIMARY_BASE_URL"),
      apiKey: required("LLM_PRIMARY_API_KEY"),
      model: required("LLM_PRIMARY_MODEL"),
    },
    fallback: process.env.LLM_FALLBACK_BASE_URL
      ? {
          baseUrl: process.env.LLM_FALLBACK_BASE_URL,
          apiKey: process.env.LLM_FALLBACK_API_KEY ?? "",
          model: process.env.LLM_FALLBACK_MODEL ?? "",
        }
      : undefined,
    embedUrl: process.env.BGE_EMBED_URL || undefined,
  };
}

export class LlmGateway {
  constructor(private readonly config: GatewayConfig = configFromEnv()) {}

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    void messages;
    void opts;
    void this.config;
    throw new Error("llm-gateway: not implemented (scaffold P0; lands in P5)");
  }

  async embed(text: string): Promise<number[]> {
    void text;
    throw new Error("llm-gateway: embed not implemented (scaffold P0; lands in P5)");
  }
}
