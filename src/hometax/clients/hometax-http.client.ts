import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig, Method } from 'axios';
import { HometaxSessionService } from '../services/hometax-session.service';

interface RequestOptions {
  method: Method;
  url: string;
  baseURL?: string;
  headers?: Record<string, string>;
  data?: unknown;
  rawBody?: boolean;
  responseType?: AxiosRequestConfig['responseType'];
}

@Injectable()
export class HometaxHttpClient {
  private readonly logger = new Logger(HometaxHttpClient.name);

  constructor(private readonly sessionService: HometaxSessionService) {}

  async request<T = unknown>(options: RequestOptions): Promise<T> {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0',
      ...options.headers,
    };

    if (!headers.Cookie) {
      const cookieHeader = this.sessionService.cookieHeader();
      if (cookieHeader) {
        headers.Cookie = cookieHeader;
      }
    }

    this.logger.log(`Hometax ${options.method} ${options.baseURL ?? 'https://hometax.go.kr'}${options.url}`);

    const response = await axios.request({
      method: options.method,
      baseURL: options.baseURL ?? 'https://hometax.go.kr',
      url: options.url,
      headers,
      data: options.data,
      responseType: options.responseType,
      transformRequest: options.rawBody ? [(data) => data] : undefined,
      validateStatus: () => true,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 30000,
    });

    this.sessionService.mergeSetCookieHeaders(response.headers['set-cookie']);

    if (response.status >= 400) {
      const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      this.logger.warn(`Hometax ${options.method} ${options.url} failed: ${response.status} ${body.slice(0, 1000)}`);
      throw new Error(`홈택스 요청 실패: ${response.status} ${options.url}`);
    }

    this.logger.log(`Hometax ${options.method} ${options.url} -> ${response.status}`);

    return response.data as T;
  }

  getText(url: string, headers: Record<string, string> = {}, baseURL?: string): Promise<string> {
    return this.request<string>({
      method: 'GET',
      url,
      baseURL,
      headers,
      responseType: 'text',
    });
  }

  postJson<T = unknown>(
    url: string,
    data: unknown,
    headers: Record<string, string> = {},
    baseURL?: string,
  ): Promise<T> {
    return this.request<T>({
      method: 'POST',
      url,
      baseURL,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=UTF-8',
        ...headers,
      },
      data,
    });
  }

  postForm(
    url: string,
    data: Record<string, string>,
    headers: Record<string, string> = {},
    baseURL?: string,
  ): Promise<string> {
    return this.request<string>({
      method: 'POST',
      url,
      baseURL,
      headers: {
        Accept: 'text/plain, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        ...headers,
      },
      data: new URLSearchParams(data).toString(),
      rawBody: true,
      responseType: 'text',
    });
  }
}
