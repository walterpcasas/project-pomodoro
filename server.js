const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const CSV_FILE = path.join(ROOT_DIR, "pomodoro_registros.csv");
const CSV_HEADER = "fecha,hora,tipo,duracion,objetivo\n";
const VALID_TYPES = new Set(["concentracion", "descanso"]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

async function ensureCsvFile() {
  try {
    const content = await fs.readFile(CSV_FILE, "utf8");
    const firstLine = content.split(/\r?\n/, 1)[0];
    if (firstLine !== CSV_HEADER.trim()) {
      await fs.writeFile(CSV_FILE, CSV_HEADER, "utf8");
    }
  } catch {
    await fs.writeFile(CSV_FILE, CSV_HEADER, "utf8");
  }
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function validateLogPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.fecha !== "string" || !/^\d{2}\/\d{2}\/\d{4}$/.test(payload.fecha.trim())) return null;
  if (typeof payload.hora !== "string" || !/^\d{2}:\d{2}$/.test(payload.hora.trim())) return null;
  if (!VALID_TYPES.has(payload.tipo)) return null;
  if (typeof payload.duracion !== "string" || !/^\d{2}:\d{2}:\d{2}$/.test(payload.duracion.trim())) return null;

  return {
    fecha: payload.fecha.trim(),
    hora: payload.hora.trim(),
    tipo: payload.tipo,
    duracion: payload.duracion.trim(),
    objetivo: typeof payload.objective === "string" && payload.objective.trim() ? payload.objective.trim() : "Trabajo",
  };
}

function buildCsvRow(entry) {
  return [entry.fecha, entry.hora, entry.tipo, entry.duracion, entry.objetivo].map(escapeCsv).join(",") + "\n";
}

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Body too large");
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function resolveStaticPath(urlPathname) {
  const relativePath = urlPathname === "/" ? "/index.html" : urlPathname;
  const normalizedPath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(ROOT_DIR, normalizedPath);
  return fullPath.startsWith(ROOT_DIR) ? fullPath : null;
}

async function handleStaticRequest(req, res, pathname) {
  const filePath = resolveStaticPath(pathname);
  if (!filePath) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function requestListener(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = parsedUrl.pathname;

  if (req.method === "POST" && pathname === "/api/logs") {
    try {
      const bodyText = await readRequestBody(req);
      const payload = JSON.parse(bodyText);
      const entry = validateLogPayload(payload);
      if (!entry) {
        sendJson(res, 400, { error: "Payload invalido" });
        return;
      }

      await ensureCsvFile();
      await fs.appendFile(CSV_FILE, buildCsvRow(entry), "utf8");
      sendJson(res, 201, { ok: true });
      return;
    } catch (error) {
      sendJson(res, 500, { error: "No se pudo escribir el CSV" });
      return;
    }
  }

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  await handleStaticRequest(req, res, pathname);
}

async function start() {
  await ensureCsvFile();
  const server = http.createServer((req, res) => {
    requestListener(req, res);
  });

  server.listen(PORT, HOST, () => {
    console.log(`Pomodoro disponible en http://${HOST}:${PORT}`);
    console.log(`CSV: ${CSV_FILE}`);
  });
}

start().catch((error) => {
  console.error("No se pudo iniciar el servidor:", error);
  process.exit(1);
});
