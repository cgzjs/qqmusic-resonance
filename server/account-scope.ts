export type AccountScope = "demo" | "preview";

// 参赛体验与本机联调复用同一套服务，存储名称始终隔离。
export const accountObjectName = (accountId: string, scope: AccountScope = "demo") => scope === "preview" ? `preview-account:${accountId}` : accountId;
export const nearbyObjectName = (scope: AccountScope = "demo") => scope === "preview" ? "preview-area-v1" : "demo-area-v1";
export const bottleObjectName = (scope: AccountScope, demoAccount?: string) => `${scope}-bottles-v1${demoAccount ? `:${demoAccount}` : ""}`;
