import { createHmac } from 'node:crypto';

const testVal = [
  'fjaS3kdHQsdfvnm359WxzmWMV8xm5qmrcRXxolOqm4',
  'qns5HuJxhT3QM8cIOSxqYw92xOpv7oMETetLjO3Zog',
  'Zomr4yL5NpOcj4EfBxdDsweUxOvGWugbJ7c9xhwm',
  'tOpenmvLO8XhwmY2Nxpi2eP3xcmniJj2e4xc8FamH0',
  'qyVMuRUwZO93CGhkWtJFFrmEKMAg9z3FBLcKAyMxxA',
  'RF413bvdLE31OL3dnmeC7r7EbMVo1oh4OrOVMMysR',
  'OINbDScmre3r8ckDpIoKAyO5B6wwKulnDJkxwFBvRX',
];

export function createNtsPayload(reqData: string, userId: string, second = new Date().getSeconds()): string {
  const normalizedSecond = Math.max(0, Math.min(59, second));
  const az = normalizedSecond.toString().padStart(2, '0');
  const key = testVal[normalizedSecond % testVal.length];
  const hmac = createHmac('sha256', key)
    .update(reqData + userId, 'utf8')
    .digest('base64')
    .replace(/[^0-9a-zA-Z]/g, '');

  return `${reqData}<nts<nts>nts>${Number(az) + 11}${hmac}${az}`;
}

export function stringifyForHometax(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number') {
      return String(item);
    }
    return item as unknown;
  });
}
