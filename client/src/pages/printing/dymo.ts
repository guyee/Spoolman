export interface DymoPrintSettings {
  serviceUrl: string;
  printerName: string;
  paperName: string;
  copies: number;
  labelTemplateXml: string;
}

export interface DymoPrinter {
  name: string;
  printerType?: string;
  modelName?: string;
  isConnected?: boolean;
  isLocal?: boolean;
}

export interface DymoLabelData {
  title: string;
  details: string;
  qr: string;
}

export const defaultDymoPrintSettings: DymoPrintSettings = {
  serviceUrl: "http://127.0.0.1:43191",
  printerName: "DYMO LabelWriter 450",
  paperName: "30252 Address",
  copies: 1,
  labelTemplateXml: `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Address</Id>
  <PaperName>{{paperName}}</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="5040" Height="1581" Rx="270" Ry="270" />
  </DrawCommands>
  <ObjectInfo>
    <BarcodeObject>
      <Name>QR</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <Text>{{qr}}</Text>
      <Type>QRCode</Type>
      <Size>Large</Size>
      <TextPosition>None</TextPosition>
      <TextFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <CheckSumFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <TextEmbedding>None</TextEmbedding>
      <ECLevel>0</ECLevel>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <QuietZonesPadding Left="0" Top="0" Right="0" Bottom="0" />
    </BarcodeObject>
    <Bounds X="120" Y="150" Width="1250" Height="1250" />
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>TITLE</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String xml:space="preserve">{{title}}</String>
          <Attributes>
            <Font Family="Arial" Size="11" Bold="True" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="1450" Y="140" Width="3400" Height="430" />
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>DETAILS</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>AlwaysFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String xml:space="preserve">{{details}}</String>
          <Attributes>
            <Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="1450" Y="620" Width="3400" Height="820" />
  </ObjectInfo>
</DieCutLabel>`,
};

function normalizeServiceUrl(serviceUrl: string): string {
  return serviceUrl.trim().replace(/\/+$/, "");
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderTemplate(template: string, settings: DymoPrintSettings, label: DymoLabelData): string {
  return template
    .replaceAll("{{paperName}}", xmlEscape(settings.paperName))
    .replaceAll("{{title}}", xmlEscape(label.title))
    .replaceAll("{{details}}", xmlEscape(label.details))
    .replaceAll("{{qr}}", xmlEscape(label.qr));
}

function printParamsXml(copies: number): string {
  return `<LabelWriterPrintParams><Copies>${Math.max(1, copies)}</Copies><PrintQuality>BarcodeAndGraphics</PrintQuality></LabelWriterPrintParams>`;
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
      paperName: settings.paperName,
      copies: settings.copies,
      labels,
      labelXmls: labels.map((label) => renderTemplate(settings.labelTemplateXml, settings, label)),
      printParamsXml: printParamsXml(settings.copies),
    }),
  });
}
