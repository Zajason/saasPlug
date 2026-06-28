import "dotenv/config";
import express from "express";
import cors from "cors";
import net from "node:net";

type CheckStatus = "healthy" | "degraded" | "down";

type CheckResult = {
  name: string;
  group: "Microservices" | "Infrastructure" | "Gateway smoke" | "External providers";
  target: string;
  status: CheckStatus;
  statusCode?: number;
  latencyMs: number;
  detail: string;
  checkedAt: string;
};

const app = express();
app.use(cors());
app.use(express.json());

const timeoutMs = Number(process.env.MONITOR_TIMEOUT_MS ?? 4000);
const apiGatewayUrl = process.env.API_GATEWAY_URL ?? "http://localhost:8080";
const apiKey = process.env.INTEGRATION_DEFAULT_API_KEY ?? "sk_saas_replace_me";

const serviceChecks = [
  ["ApiGateway", apiGatewayUrl],
  ["AuthService", process.env.AUTH_SERVICE_URL ?? "http://localhost:8081"],
  ["UserService", process.env.USER_SERVICE_URL ?? "http://localhost:8082"],
  ["VehicleService", process.env.VEHICLE_SERVICE_URL ?? "http://localhost:8083"],
  ["ChargerService", process.env.CHARGER_SERVICE_URL ?? "http://localhost:8084"],
  ["ReservationService", process.env.RESERVATION_SERVICE_URL ?? "http://localhost:8085"],
  ["SessionService", process.env.SESSION_SERVICE_URL ?? "http://localhost:8086"],
  ["BillingService", process.env.BILLING_SERVICE_URL ?? "http://localhost:8087"],
  ["ProviderService", process.env.PROVIDER_SERVICE_URL ?? "http://localhost:8088"],
  ["IntegrationService", process.env.INTEGRATION_SERVICE_URL ?? "http://localhost:8090"],
  ["AnalyticsService", process.env.ANALYTICS_SERVICE_URL ?? "http://localhost:8089"],
  ["AuditService", process.env.AUDIT_SERVICE_URL ?? "http://localhost:8091"],
] as const;

const providerChecks = [
  ["redPlug", "https://davinci.softlab.ntua.gr/saas26/redPlug/api/points"],
  ["greenPlug", "https://davinci.softlab.ntua.gr/saas26/greenPlug/api/chargingPoints"],
  ["bluePlug", "https://davinci.softlab.ntua.gr/saas26/bluePlug/api/locations"],
] as const;

function nowIso() {
  return new Date().toISOString();
}

function statusFromOk(ok: boolean): CheckStatus {
  return ok ? "healthy" : "down";
}

async function timed<T>(fn: () => Promise<T>) {
  const started = Date.now();
  try {
    const value = await fn();
    return { value, latencyMs: Date.now() - started };
  } catch (error) {
    return { error, latencyMs: Date.now() - started };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function checkHttp(args: {
  name: string;
  group: CheckResult["group"];
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  expect?: (res: Response, body: unknown) => boolean;
}): Promise<CheckResult> {
  const checkedAt = nowIso();
  const { value, error, latencyMs } = await timed(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(args.url, {
        method: args.method ?? "GET",
        headers: args.headers,
        body: args.body,
        signal: controller.signal,
      });
      const text = await res.text().catch(() => "");
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = text;
      }
      return { res, body };
    } finally {
      clearTimeout(timeout);
    }
  });

  if (error || !value) {
    return {
      name: args.name,
      group: args.group,
      target: args.url,
      status: "down",
      latencyMs,
      detail: errorMessage(error),
      checkedAt,
    };
  }

  const ok = args.expect ? args.expect(value.res, value.body) : value.res.ok;
  return {
    name: args.name,
    group: args.group,
    target: args.url,
    status: statusFromOk(ok),
    statusCode: value.res.status,
    latencyMs,
    detail: ok ? "OK" : `Unexpected response ${value.res.status}`,
    checkedAt,
  };
}

async function checkTcp(name: string, host: string, port: number): Promise<CheckResult> {
  const checkedAt = nowIso();
  const target = `${host}:${port}`;
  const { error, latencyMs } = await timed(
    () =>
      new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({ host, port });
        socket.setTimeout(timeoutMs);
        socket.once("connect", () => {
          socket.destroy();
          resolve();
        });
        socket.once("timeout", () => {
          socket.destroy();
          reject(new Error("Connection timed out"));
        });
        socket.once("error", reject);
      }),
  );

  return {
    name,
    group: "Infrastructure",
    target,
    status: error ? "down" : "healthy",
    latencyMs,
    detail: error ? errorMessage(error) : "TCP reachable",
    checkedAt,
  };
}

async function collectStatus() {
  const microservices = serviceChecks.map(([name, baseUrl]) =>
    checkHttp({
      name,
      group: "Microservices",
      url: `${baseUrl}/api/health`,
      expect: (res, body) => res.ok && typeof body === "object" && body !== null,
    }),
  );

  const infrastructure = [
    checkTcp("PostgreSQL", process.env.POSTGRES_HOST ?? "postgres", Number(process.env.POSTGRES_PORT_INTERNAL ?? 5432)),
    checkTcp("Redis", process.env.REDIS_HOST ?? "redis", Number(process.env.REDIS_PORT_INTERNAL ?? 6379)),
    checkTcp("RabbitMQ AMQP", process.env.RABBITMQ_HOST ?? "rabbitmq", Number(process.env.RABBITMQ_PORT_INTERNAL ?? 5672)),
    checkHttp({
      name: "RabbitMQ management",
      group: "Infrastructure",
      url: process.env.RABBITMQ_MANAGEMENT_URL ?? "http://rabbitmq:15672",
      expect: (res) => res.ok || res.status === 401,
    }),
  ];

  const gatewaySmoke = [
    checkHttp({
      name: "Gateway routes chargers",
      group: "Gateway smoke",
      url: `${apiGatewayUrl}/api/v1/points`,
      expect: (res, body) => res.ok && Array.isArray(body),
    }),
    checkHttp({
      name: "Demo user login",
      group: "Gateway smoke",
      url: `${apiGatewayUrl}/api/v1/auth/signin`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@saasplug.local", password: "admin123" }),
      expect: (res, body) =>
        res.ok &&
        typeof body === "object" &&
        body !== null &&
        typeof (body as { token?: unknown }).token === "string",
    }),
  ];

  const externalProviders = providerChecks.map(([name, url]) =>
    checkHttp({
      name,
      group: "External providers",
      url,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      expect: (res, body) => res.ok && Array.isArray(body),
    }),
  );

  const checks = await Promise.all([
    ...microservices,
    ...infrastructure,
    ...gatewaySmoke,
    ...externalProviders,
  ]);

  const down = checks.filter((check) => check.status === "down").length;
  const degraded = checks.filter((check) => check.status === "degraded").length;
  const overall: CheckStatus = down > 0 ? "down" : degraded > 0 ? "degraded" : "healthy";

  return {
    service: "MonitorService",
    ok: overall === "healthy",
    overall,
    checkedAt: nowIso(),
    summary: {
      total: checks.length,
      healthy: checks.filter((check) => check.status === "healthy").length,
      degraded,
      down,
    },
    checks,
  };
}

const dashboardHtml = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>saasPlug Health Monitor</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --ink: #111827;
      --muted: #64748b;
      --line: #d9e0ea;
      --healthy: #0f766e;
      --healthy-bg: #ccfbf1;
      --down: #b91c1c;
      --down-bg: #fee2e2;
      --warn: #b45309;
      --warn-bg: #fef3c7;
      --accent: #1d4ed8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--ink);
    }
    header {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 24px;
      border-bottom: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(10px);
    }
    h1 { margin: 0; font-size: 20px; font-weight: 650; letter-spacing: 0; }
    main { max-width: 1240px; margin: 0 auto; padding: 24px; }
    .subtle { color: var(--muted); font-size: 13px; }
    .toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    button {
      border: 1px solid #1d4ed8;
      background: #1d4ed8;
      color: white;
      border-radius: 8px;
      padding: 9px 12px;
      font: inherit;
      cursor: pointer;
    }
    button:disabled { opacity: 0.6; cursor: wait; }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 13px;
      font-weight: 600;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .healthy { color: var(--healthy); background: var(--healthy-bg); border-color: #5eead4; }
    .down { color: var(--down); background: var(--down-bg); border-color: #fecaca; }
    .degraded { color: var(--warn); background: var(--warn-bg); border-color: #fcd34d; }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .metric, section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .metric { padding: 16px; }
    .metric span { display: block; color: var(--muted); font-size: 12px; }
    .metric strong { display: block; margin-top: 6px; font-size: 28px; font-weight: 650; }
    section { margin-top: 14px; overflow: hidden; }
    section h2 {
      margin: 0;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      font-size: 15px;
      font-weight: 650;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      padding: 12px 16px;
      border-bottom: 1px solid #edf1f6;
      text-align: left;
      font-size: 13px;
      vertical-align: top;
    }
    th { color: var(--muted); font-weight: 600; background: #fbfcfe; }
    tr:last-child td { border-bottom: 0; }
    code {
      display: inline-block;
      max-width: 520px;
      overflow: hidden;
      text-overflow: ellipsis;
      vertical-align: bottom;
      color: #334155;
      font-size: 12px;
    }
    .empty, .error {
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: white;
      color: var(--muted);
    }
    .error { color: var(--down); border-color: #fecaca; background: #fff1f2; }
    @media (max-width: 760px) {
      header { align-items: flex-start; flex-direction: column; }
      main { padding: 16px; }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      table, thead, tbody, tr, th, td { display: block; }
      thead { display: none; }
      tr { border-bottom: 1px solid var(--line); }
      td { border-bottom: 0; padding: 8px 14px; }
      td::before { content: attr(data-label); display: block; color: var(--muted); font-size: 11px; margin-bottom: 3px; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>saasPlug Health Monitor</h1>
      <div class="subtle">Live read-only checks for services, infrastructure, gateway routing, and provider APIs.</div>
    </div>
    <div class="toolbar">
      <span id="overall" class="pill degraded">Checking...</span>
      <span id="updated" class="subtle">Not checked yet</span>
      <button id="refresh" type="button">Refresh</button>
    </div>
  </header>
  <main>
    <div id="message" class="empty">Loading status...</div>
    <div id="content" hidden>
      <div class="summary">
        <div class="metric"><span>Total checks</span><strong id="total">0</strong></div>
        <div class="metric"><span>Healthy</span><strong id="healthy">0</strong></div>
        <div class="metric"><span>Degraded</span><strong id="degraded">0</strong></div>
        <div class="metric"><span>Down</span><strong id="down">0</strong></div>
      </div>
      <div id="groups"></div>
    </div>
  </main>
  <script>
    const refreshButton = document.getElementById("refresh");
    const message = document.getElementById("message");
    const content = document.getElementById("content");
    const groupsEl = document.getElementById("groups");
    const overall = document.getElementById("overall");
    const updated = document.getElementById("updated");

    function setPill(el, status, label) {
      el.className = "pill " + status;
      el.textContent = label || status;
    }

    function cell(label, value) {
      const td = document.createElement("td");
      td.dataset.label = label;
      if (value instanceof Node) td.appendChild(value);
      else td.textContent = value;
      return td;
    }

    function render(data) {
      message.hidden = true;
      content.hidden = false;
      setPill(overall, data.overall, "Overall: " + data.overall);
      updated.textContent = "Updated " + new Date(data.checkedAt).toLocaleTimeString();
      document.getElementById("total").textContent = data.summary.total;
      document.getElementById("healthy").textContent = data.summary.healthy;
      document.getElementById("degraded").textContent = data.summary.degraded;
      document.getElementById("down").textContent = data.summary.down;
      groupsEl.replaceChildren();

      const byGroup = data.checks.reduce((acc, check) => {
        (acc[check.group] ||= []).push(check);
        return acc;
      }, {});

      for (const [group, checks] of Object.entries(byGroup)) {
        const section = document.createElement("section");
        const title = document.createElement("h2");
        title.textContent = group;
        section.appendChild(title);
        const table = document.createElement("table");
        table.innerHTML = "<thead><tr><th>Name</th><th>Status</th><th>Target</th><th>Latency</th><th>Detail</th></tr></thead>";
        const tbody = document.createElement("tbody");
        checks.forEach((check) => {
          const tr = document.createElement("tr");
          const status = document.createElement("span");
          setPill(status, check.status, check.status);
          const target = document.createElement("code");
          target.textContent = check.target;
          tr.append(
            cell("Name", check.name),
            cell("Status", status),
            cell("Target", target),
            cell("Latency", check.latencyMs + " ms"),
            cell("Detail", check.detail)
          );
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        section.appendChild(table);
        groupsEl.appendChild(section);
      }
    }

    async function load() {
      refreshButton.disabled = true;
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) throw new Error("Monitor status failed: " + res.status);
        render(await res.json());
      } catch (error) {
        content.hidden = true;
        message.hidden = false;
        message.className = "error";
        message.textContent = error instanceof Error ? error.message : "Failed to load monitor status.";
        setPill(overall, "down", "Monitor error");
      } finally {
        refreshButton.disabled = false;
      }
    }

    refreshButton.addEventListener("click", load);
    load();
    setInterval(load, 15000);
  </script>
</body>
</html>`;

app.get("/", (_req, res) => {
  res.type("html").send(dashboardHtml);
});

app.get("/api/health", (_req, res) => {
  res.json({ service: "MonitorService", ok: true });
});

app.get("/api/status", async (_req, res) => {
  res.json(await collectStatus());
});

const port = Number(process.env.PORT ?? 9090);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`MonitorService running on http://localhost:${port}`));
}

export default app;
