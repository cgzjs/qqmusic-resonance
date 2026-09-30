declare namespace Cloudflare {
  interface Env {
    ACCOUNTS: DurableObjectNamespace;
    DEMO_HOST_ENABLED?: string;
    PUBLIC_DEMO_ORIGIN?: string;
    ROOMS: DurableObjectNamespace;
    NEARBY: DurableObjectNamespace;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AI?: { run: (model: string, input: unknown) => Promise<unknown> };
    AI_MODEL?: string;
    AI_IMAGE_MODEL?: string;
    AI_IMAGE_PROVIDER?: string;
    TENCENT_TOKENHUB_API_KEY?: string;
    TENCENT_TOKENHUB_BASE_URL?: string;
    OPENAI_API_KEY?: string;
    OPENAI_BASE_URL?: string;
    OPENAI_IMAGE_MODEL?: string;
  }
}
