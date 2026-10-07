import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

// 当前 Rolldown 对带缓存副作用的动态导入返回了 chunk namespace；
// 以静态 namespace 保留导航的真实导出与原有异步缓存接口。
function navigationNamespaceCompat(): Plugin {
  const modules = [["./navigation.js", "resonanceNavigation"], ["../server/app-elements.js", "resonanceAppElements"], ["../server/app-rsc-cache-busting.js", "resonanceCacheBusting"], ["../server/app-rsc-render-mode.js", "resonanceRenderMode"], ["../server/headers.js", "resonanceHeaders"]];
  return { name: "resonance-navigation-namespace", apply: "build", enforce: "pre", transform(source, id) {
    if (!id.replaceAll("\\", "/").split("?")[0].endsWith("/vinext/dist/shims/link.js")) return null;
    for (const [path, name] of modules) {
      const target = `import("${path}")`;
      if (!source.includes(target)) throw new Error("Vinext Link 结构已变化，请重新核验导航兼容修正");
      source = source.replaceAll(target, `Promise.resolve(${name})`);
    }
    if (!source.startsWith('"use client";')) throw new Error("Vinext Link 客户端边界已变化，请重新核验兼容修正");
    const imports = modules.map(([path, name]) => `import * as ${name} from "${path}";`).join("\n");
    return { code: source.replace('"use client";', `"use client";\n${imports}`), map: null };
  } };
}

const localBindingConfig = {
  main: "./server/worker.ts",
  compatibility_flags: ["nodejs_compat"],
  durable_objects: { bindings: [{ name: "ROOMS", class_name: "ListeningRoom" }, { name: "NEARBY", class_name: "NearbyArea" }, { name: "ACCOUNTS", class_name: "PluginAccount" }] },
  migrations: [{ tag: "v1-listening-rooms", new_sqlite_classes: ["ListeningRoom"] }, { tag: "v2-nearby-area", new_sqlite_classes: ["NearbyArea"] }, { tag: "v3-plugin-account", new_sqlite_classes: ["PluginAccount"] }],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      navigationNamespaceCompat(),
      vinext(),
      sites({ mockAuth: !managedLinux }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          ...localBindingConfig,
          ...(command === "build" ? {
            name: "qqmusic-resonance",
            routes: [{ pattern: "resonance.de5.net", custom_domain: true }],
            workers_dev: true,
          } : {}),
          vars: {
            DEMO_HOST_ENABLED: command === "serve" ? "true" : "false",
            ...(command === "build" ? { PUBLIC_DEMO_ORIGIN: "https://resonance.de5.net", AI_IMAGE_PROVIDER: "tencent" } : {}),
          },
        },
      }),
    ],
  };
});
