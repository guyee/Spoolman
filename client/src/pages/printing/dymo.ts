import { getAPIURL } from "../../utils/url";

export interface DymoPrintSettings {
  copies: number;
}

export interface DymoPrinter {
  name: string;
  printerType?: string;
  modelName?: string;
  isConnected?: boolean;
  isLocal?: boolean;
}

export interface DymoTextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type DymoLabelText = string | DymoTextSegment | DymoTextSegment[];

export interface DymoLabelData {
  qrText: string;
  brand: DymoLabelText;
  filamentType: DymoLabelText;
  colorCode?: DymoLabelText;
  colorName: DymoLabelText;
}

export const defaultDymoPrintSettings: DymoPrintSettings = {
  copies: 1,
};

async function dymoFetch(path: string, init?: RequestInit): Promise<string> {
  const response = await fetch(`${getAPIURL()}/dymo${path}`, {
    cache: "no-store",
    ...init,
  });

  const text = await response.text();
  if (!response.ok) {
    let errorMessage: string | undefined;
    try {
      const result = JSON.parse(text) as { error?: string; message?: string };
      errorMessage = result.error ?? result.message;
    } catch {
      // Fall through to the generic response text below.
    }
    throw new Error(errorMessage ?? (text || `${response.status} ${response.statusText}`));
  }
  return text;
}

async function dymoJsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const body = await dymoFetch(path, init);
  return JSON.parse(body) as T;
}

export async function checkDymoService(): Promise<string> {
  const result = await dymoJsonFetch<{ ok: boolean; statusConnected?: boolean; error?: string }>("/health");
  if (!result.ok) {
    throw new Error(result.error ?? "Dymo helper is not ready.");
  }
  return result.statusConnected === undefined ? "true" : String(result.statusConnected);
}

export async function getDymoPrinters(): Promise<DymoPrinter[]> {
  const result = await dymoJsonFetch<{ printers: DymoPrinter[] }>("/health");
  return result.printers;
}

export async function printDymoLabels(settings: DymoPrintSettings, labels: DymoLabelData[]): Promise<void> {
  await dymoFetch("/print", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      copies: settings.copies,
      labels,
    }),
  });
}
