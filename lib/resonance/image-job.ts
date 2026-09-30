export type ImageJobError = "AI_NOT_CONFIGURED" | "AI_AUTH_FAILED" | "AI_BILLING_REQUIRED" | "AI_RATE_LIMIT" | "AI_CONTENT_REJECTED" | "AI_TIMEOUT" | "AI_UNAVAILABLE" | "AI_INVALID_IMAGE" | "JOB_INTERRUPTED" | "JOB_EXPIRED" | "REQUEST_CONFLICT" | "JOB_BUSY" | "IMAGE_COOLDOWN" | "IMAGE_HOURLY_LIMIT" | "IMAGE_DAILY_LIMIT" | "IMAGE_BUDGET_LIMIT" | "IMAGE_CAPACITY";
export type ImageJob = {
  id: string;
  trackId: string;
  title: string;
  status: "pending" | "running" | "succeeded" | "failed";
  createdAt: number;
  expiresAt: number;
  error?: ImageJobError;
  retryAfter?: number;
};
export const imageJobBusy = (job: ImageJob | null) => job?.status === "pending" || job?.status === "running";
export const IMAGE_JOB_TTL = 24 * 60 * 60 * 1000;
export const IMAGE_JOB_DEADLINE = 120_000;
export const imageJobMessages: Record<ImageJobError, string> = {
  AI_NOT_CONFIGURED: "还没配置生图服务，请联系维护者",
  AI_AUTH_FAILED: "生图密钥无效或没有模型权限，请联系维护者",
  AI_BILLING_REQUIRED: "生图额度不足或未开通付费，请联系维护者",
  AI_RATE_LIMIT: "生图服务繁忙，稍后再试",
  AI_CONTENT_REJECTED: "这个内容无法生成，换个标题再试",
  AI_TIMEOUT: "生图等待超时，可以重新生成",
  AI_UNAVAILABLE: "生图服务暂时连不上，稍后再试",
  AI_INVALID_IMAGE: "图片返回不完整，请重新生成",
  JOB_INTERRUPTED: "这次生成被中断，点击重新生成",
  JOB_EXPIRED: "图片已过期，请重新生成",
  REQUEST_CONFLICT: "请求内容已变化，请重新生成",
  JOB_BUSY: "已有一张图正在生成，先等它完成",
  IMAGE_COOLDOWN: "刚生成过一张，请稍后再试",
  IMAGE_HOURLY_LIMIT: "这一小时的生图次数已用完，稍后再来",
  IMAGE_DAILY_LIMIT: "今天的生图次数已用完，明天再来",
  IMAGE_BUDGET_LIMIT: "今天的站点生图额度已用完",
  IMAGE_CAPACITY: "有其他图片正在生成，稍后再试",
};
