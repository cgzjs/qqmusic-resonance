declare namespace Cloudflare {
  interface Env {
    ACCOUNTS: DurableObjectNamespace;
    DEMO_HOST_ENABLED?: string;
    ROOMS: DurableObjectNamespace;
    NEARBY: DurableObjectNamespace;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
