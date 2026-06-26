import { randomBytes } from 'crypto';

const FORM_FEED = '\f';
const VERTICAL_TAB = '\v';

export interface RaonkEncodedField {
  name: string;
  value: string;
}

export interface RaonkUploadStartResult {
  serverPath: string;
  size: number;
  rawPlain: string;
}

export interface RaonkUploadCompleteResult {
  uploadName: string;
  originalName: string;
  serverRelativePath: string;
  rawPlain: string;
}

export function createRaonkGuid(): string {
  return randomBytes(16).toString('hex');
}

export function encodeRaonkPlain(value: string): string {
  let encoded = Buffer.from(value, 'utf8').toString('base64');
  if (encoded.length >= 10) {
    encoded = insertAt(encoded, 8, 'r');
    encoded = insertAt(encoded, 6, 'a');
    encoded = insertAt(encoded, 9, 'o');
    encoded = insertAt(encoded, 7, 'n');
    encoded = insertAt(encoded, 8, 'w');
    encoded = insertAt(encoded, 6, 'i');
    encoded = insertAt(encoded, 9, 'z');
  } else {
    encoded = insertAt(encoded, encoded.length - 1, '$');
    encoded = insertAt(encoded, 0, '$');
  }

  return encoded.replace(/[+]/g, '%2B');
}

export function decodeRaonkPlain(value: string): string {
  let encoded = value.replace(/%2B/g, '+').replace(/\s+/g, '');
  if (encoded.startsWith('_')) {
    encoded = encoded.slice(1);
  }

  if (encoded.length >= 15) {
    const chars = encoded.split('');
    for (const index of [9, 6, 8, 7, 9, 6, 8]) {
      chars.splice(index, 1);
    }
    encoded = chars.join('');
  } else {
    encoded = encoded.replace(/#/g, '').replace(/\$/g, '');
  }

  return Buffer.from(encoded, 'base64').toString('utf8');
}

export function encodeRaonkFormField(command: string): RaonkEncodedField {
  return {
    name: 'k00',
    value: encodeRaonkPlain(command),
  };
}

export function buildRaonkStartCommand(params: {
  guid: string;
  fileSize: number;
  originalName: string;
  folderNameRule: string;
}): string {
  return [
    kv('kc', 'c01'),
    kv('k01', '0'),
    kv('k05', '1'),
    kv('k12', params.guid),
    kv('k13', String(params.fileSize)),
    kv('k14', params.originalName),
    kv('k15', ''),
    kv('k16', ''),
    kv('k17', params.folderNameRule),
    kv('k20', '0z'),
    kv('k21', ''),
  ].join(VERTICAL_TAB);
}

export function buildRaonkChunkCommand(params: {
  guid: string;
  serverPath: string;
}): string {
  return [
    kv('kc', 'c02'),
    kv('k01', '0'),
    kv('k02', ''),
    kv('k03', '0'),
    kv('k05', '1'),
    kv('k12', params.guid),
    kv('k19', '0'),
    kv('k26', params.serverPath),
  ].join(VERTICAL_TAB);
}

export function buildRaonkCompleteCommand(params: {
  guid: string;
  originalName: string;
  folderNameRule: string;
}): string {
  return [
    kv('kc', 'c03'),
    kv('k01', '0'),
    kv('k12', params.guid),
    kv('k14', params.originalName),
    kv('k15', ''),
    kv('k16', ''),
    kv('k17', params.folderNameRule),
    kv('k20', '0z'),
    kv('k21', ''),
  ].join(VERTICAL_TAB);
}

export function unwrapRaonkOk(response: string): string {
  const trimmed = response.trim();
  const body = trimmed.startsWith('<RAONK>') ? trimmed.replace(/^<RAONK>/, '').replace(/<\/RAONK>$/, '') : trimmed;
  if (body === '[OK]') {
    return '';
  }
  if (body.startsWith('[OK]')) {
    return decodeRaonkPlain(body.slice(4));
  }
  if (body.startsWith('[FAIL]')) {
    throw new Error(`RAON 업로드 실패: ${decodeRaonkPlain(body.slice(6))}`);
  }
  throw new Error(`RAON 응답 형식이 예상과 다릅니다: ${trimmed.slice(0, 200)}`);
}

export function parseRaonkStartResponse(response: string): RaonkUploadStartResult {
  const plain = unwrapRaonkOk(response);
  const [serverPath, sizeText] = plain.split(VERTICAL_TAB);
  if (!serverPath) {
    throw new Error(`RAON 시작 응답에서 serverPath를 찾지 못했습니다: ${plain}`);
  }

  return {
    serverPath,
    size: Number(sizeText) || 0,
    rawPlain: plain,
  };
}

export function parseRaonkCompleteResponse(response: string): RaonkUploadCompleteResult {
  const plain = unwrapRaonkOk(response);
  const first = plain.split(FORM_FEED)[0] ?? '';
  const separatorIndex = first.indexOf(':');
  if (separatorIndex < 0) {
    throw new Error(`RAON 완료 응답에서 파일명을 찾지 못했습니다: ${plain}`);
  }

  const originalName = first.slice(0, separatorIndex);
  const serverRelativePath = first.slice(separatorIndex + 1);

  return {
    uploadName: basename(serverRelativePath),
    originalName,
    serverRelativePath,
    rawPlain: plain,
  };
}

function kv(key: string, value: string): string {
  return `${key}${FORM_FEED}${value}`;
}

function insertAt(value: string, index: number, text: string): string {
  return `${value.slice(0, index)}${text}${value.slice(index)}`;
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}
