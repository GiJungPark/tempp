import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import { HometaxHttpClient } from './hometax-http.client';
import { HometaxSessionService } from '../services/hometax-session.service';
import {
  buildRaonkChunkCommand,
  buildRaonkCompleteCommand,
  buildRaonkStartCommand,
  createRaonkGuid,
  encodeRaonkFormField,
  parseRaonkCompleteResponse,
  parseRaonkStartResponse,
  RaonkUploadCompleteResult,
  RaonkUploadStartResult,
  unwrapRaonkOk,
} from '../utils/raonk-upload';

export interface HometaxUploadResult {
  originalName: string;
  uploadName: string;
  size: number;
  raw: unknown;
  serverPath?: string;
}

export interface HometaxUploadOptions {
  baseURL?: string;
  referer?: string;
  uploadTypeCd?: string;
}

@Injectable()
export class HometaxUploadClient {
  private readonly logger = new Logger(HometaxUploadClient.name);
  private readonly tehtBaseUrl = 'https://teht.hometax.go.kr';

  constructor(
    private readonly http: HometaxHttpClient,
    private readonly sessionService: HometaxSessionService,
  ) {}

  async uploadWithholdingFile(file: Express.Multer.File): Promise<HometaxUploadResult> {
    return this.uploadElectronicFile(file, {
      baseURL: this.tehtBaseUrl,
      referer:
        'https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&tmIdx=41&tm2lIdx=4106000000&tm3lIdx=4106010000',
      uploadTypeCd: '02',
    });
  }

  async uploadElectronicFile(file: Express.Multer.File, options: HometaxUploadOptions = {}): Promise<HometaxUploadResult> {
    const sessionMap = this.sessionService.requireSessionMap();
    const subDir = `UPLOAD_DIR/${this.todayYmd()}/${sessionMap.pubcUserNo}`;
    const folderNameRule = `/rn/${subDir}`;
    const guid = createRaonkGuid();

    const start = await this.startUpload({
      guid,
      file,
      folderNameRule,
      options,
    });
    this.logger.log(`RAON startUpload path=${start.serverPath}, size=${start.size}`);

    await this.uploadChunk({
      guid,
      file,
      serverPath: start.serverPath,
      options,
    });
    this.logger.log('RAON uploadChunk complete');

    const complete = await this.completeUpload({
      guid,
      file,
      folderNameRule,
      options,
    });
    this.logger.log(`RAON completeUpload uploadName=${complete.uploadName}`);

    return {
      originalName: file.originalname,
      uploadName: complete.uploadName,
      size: file.size,
      serverPath: start.serverPath,
      raw: {
        start,
        complete,
      },
    };
  }

  private async startUpload(params: {
    guid: string;
    file: Express.Multer.File;
    folderNameRule: string;
    options: HometaxUploadOptions;
  }): Promise<RaonkUploadStartResult> {
    const command = buildRaonkStartCommand({
      guid: params.guid,
      fileSize: params.file.size,
      originalName: params.file.originalname,
      folderNameRule: params.folderNameRule,
    });
    const field = encodeRaonkFormField(command);
    const response = await this.postRaonkForm({
      [field.name]: field.value,
    }, params.options);

    this.logger.debug(`RAON start response: ${this.responseSummary(response)}`);
    return parseRaonkStartResponse(response);
  }

  private async uploadChunk(params: {
    guid: string;
    file: Express.Multer.File;
    serverPath: string;
    options: HometaxUploadOptions;
  }): Promise<void> {
    const command = buildRaonkChunkCommand({
      guid: params.guid,
      serverPath: params.serverPath,
    });
    const field = encodeRaonkFormField(command);
    const form = new FormData();
    form.append(field.name, field.value);
    form.append('blob', params.file.buffer, {
      filename: params.file.originalname,
      contentType: 'application/octet-stream',
      knownLength: params.file.size,
    });

    const response = await this.http.request<string>({
      method: 'POST',
      baseURL: params.options.baseURL ?? this.tehtBaseUrl,
      url:
        `/fileUploadDownloadNX.do?mode=upload&uploadTypeCd=${params.options.uploadTypeCd ?? '02'}` +
        `&onlineBatch=batch&raonk=${this.createRaonkRequestId()}`,
      data: form,
      rawBody: true,
      responseType: 'text',
      headers: {
        ...form.getHeaders(),
        ...this.commonHeaders(params.options.referer),
      },
    });

    this.logger.debug(`RAON chunk response: ${this.responseSummary(response)}`);
    unwrapRaonkOk(response);
  }

  private async completeUpload(params: {
    guid: string;
    file: Express.Multer.File;
    folderNameRule: string;
    options: HometaxUploadOptions;
  }): Promise<RaonkUploadCompleteResult> {
    const command = buildRaonkCompleteCommand({
      guid: params.guid,
      originalName: params.file.originalname,
      folderNameRule: params.folderNameRule,
    });
    const field = encodeRaonkFormField(command);
    const response = await this.postRaonkForm({
      [field.name]: field.value,
    }, params.options);

    this.logger.debug(`RAON complete response: ${this.responseSummary(response)}`);
    return parseRaonkCompleteResponse(response);
  }

  private postRaonkForm(data: Record<string, string>, options: HometaxUploadOptions): Promise<string> {
    return this.http.request<string>({
      method: 'POST',
      baseURL: options.baseURL ?? this.tehtBaseUrl,
      url: `/fileUploadDownloadNX.do?mode=upload&uploadTypeCd=${options.uploadTypeCd ?? '02'}&onlineBatch=batch`,
      data: new URLSearchParams(data).toString(),
      rawBody: true,
      responseType: 'text',
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        ...this.commonHeaders(options.referer),
      },
    });
  }

  private commonHeaders(referer?: string): Record<string, string> {
    return {
      Origin: 'https://hometax.go.kr',
      Referer:
        referer ??
        'https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&tmIdx=41&tm2lIdx=4106000000&tm3lIdx=4106010000',
    };
  }

  private createRaonkRequestId(): string {
    return `urk_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }

  private responseSummary(response: unknown): string {
    if (typeof response === 'string') {
      return response.replace(/\s+/g, ' ').slice(0, 1000);
    }
    return JSON.stringify(response).slice(0, 1000);
  }

  private todayYmd(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }
}
