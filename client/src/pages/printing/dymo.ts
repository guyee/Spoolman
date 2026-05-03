export interface DymoPrintSettings {
  serviceUrl: string;
  printerName: string;
  copies: number;
}

export interface DymoPrinter {
  name: string;
  printerType?: string;
  modelName?: string;
  isConnected?: boolean;
  isLocal?: boolean;
}

export interface DymoLabelData {
  qrText: string;
  brand: string;
  filamentType: string;
  colorCode?: string;
  colorName: string;
}

export const defaultDymoPrintSettings: DymoPrintSettings = {
  serviceUrl: "http://127.0.0.1:43191",
  printerName: "DYMO LabelWriter 450",
  copies: 1,
};

function normalizeServiceUrl(serviceUrl: string): string {
  return serviceUrl.trim().replace(/\/+$/, "");
}

async function dymoFetch(serviceUrl: string, path: string, init?: RequestInit): Promise<string> {
  const response = await fetch(`${normalizeServiceUrl(serviceUrl)}${path}`, {
    cache: "no-store",
    ...init,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `${response.status} ${response.statusText}`);
  }
  return text;
}

async function dymoJsonFetch<T>(serviceUrl: string, path: string, init?: RequestInit): Promise<T> {
  const body = await dymoFetch(serviceUrl, path, init);
  return JSON.parse(body) as T;
}

export async function checkDymoService(serviceUrl: string): Promise<string> {
  const result = await dymoJsonFetch<{ ok: boolean; statusConnected?: boolean; error?: string }>(serviceUrl, "/health");
  if (!result.ok) {
    throw new Error(result.error ?? "Dymo helper is not ready.");
  }
  return result.statusConnected === undefined ? "true" : String(result.statusConnected);
}

export async function getDymoPrinters(serviceUrl: string): Promise<DymoPrinter[]> {
  const result = await dymoJsonFetch<{ printers: DymoPrinter[] }>(serviceUrl, "/printers");
  return result.printers;
}

export async function printDymoLabels(settings: DymoPrintSettings, labels: DymoLabelData[]): Promise<void> {
  const serviceUrl = normalizeServiceUrl(settings.serviceUrl);
  const printerName = settings.printerName.trim();
  if (!serviceUrl) throw new Error("Dymo helper URL is required.");
  if (!printerName) throw new Error("Dymo printer name is required.");

  await dymoFetch(serviceUrl, "/print", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      confirmed: true,
      printerName,
      copies: settings.copies,
      labels,
    }),
  });
}
