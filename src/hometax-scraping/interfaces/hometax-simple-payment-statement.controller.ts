import { Body, Controller, Get, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { ValidateSimplePaymentStatementFileDto } from '../dto/simple-payment-statement.dto';
import { HometaxSimplePaymentStatementService } from '../services/hometax-simple-payment-statement.service';

@ApiTags('simple-payment-statements')
@Controller('hometax/simple-payment-statements')
export class HometaxSimplePaymentStatementController {
  constructor(private readonly simplePaymentStatementService: HometaxSimplePaymentStatementService) {}

  @ApiOperation({ summary: '간이지급명세서 변환파일 제출 profile 조회' })
  @ApiOkResponse({ description: '사업소득/기타소득 홈택스 action/profile 후보값' })
  @Get('profiles')
  profiles(): unknown {
    return this.simplePaymentStatementService.profiles();
  }

  @ApiOperation({ summary: '사업소득 간이지급명세서 변환파일 업로드/검증' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: '사업소득 간이지급명세서 전자파일' },
        paymentYear: { type: 'string', example: '2026' },
        paymentMonth: { type: 'string', example: '05' },
        filingType: { type: 'string', enum: ['regular', 'amended', 'late'], example: 'regular' },
        stmnKndCd: { type: 'string' },
        bsafClCd: { type: 'string' },
        itrfCd: { type: 'string' },
        cvaKndCd: { type: 'string' },
        uploadTypeCd: { type: 'string', example: '02' },
        baseURL: { type: 'string', example: 'https://hometax.go.kr' },
        uploadBaseURL: { type: 'string', example: 'https://hometax.go.kr' },
        referer: { type: 'string' },
        realScreenId: { type: 'string', example: 'UWEICAAD15' },
        encryptedPassword: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({ description: '간이지급명세서 검증 상태' })
  @Post('business-income/validate')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        files: 1,
        fileSize: 1024 * 1024 * 200,
      },
    }),
  )
  validateBusinessIncomeFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ValidateSimplePaymentStatementFileDto,
  ): Promise<unknown> {
    if (!file) {
      throw new Error('file 필드가 필요합니다.');
    }
    return this.simplePaymentStatementService.validateFile('business-income', file, dto);
  }

  @ApiOperation({ summary: '기타소득 간이지급명세서 변환파일 업로드/검증' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: '기타소득 간이지급명세서 전자파일' },
        paymentYear: { type: 'string', example: '2026' },
        paymentMonth: { type: 'string', example: '05' },
        filingType: { type: 'string', enum: ['regular', 'amended', 'late'], example: 'regular' },
        stmnKndCd: { type: 'string' },
        bsafClCd: { type: 'string' },
        itrfCd: { type: 'string' },
        cvaKndCd: { type: 'string' },
        uploadTypeCd: { type: 'string', example: '02' },
        baseURL: { type: 'string', example: 'https://hometax.go.kr' },
        uploadBaseURL: { type: 'string', example: 'https://hometax.go.kr' },
        referer: { type: 'string' },
        realScreenId: { type: 'string', example: 'UWEICAAD15' },
        encryptedPassword: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({ description: '간이지급명세서 검증 상태' })
  @Post('other-income/validate')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        files: 1,
        fileSize: 1024 * 1024 * 200,
      },
    }),
  )
  validateOtherIncomeFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ValidateSimplePaymentStatementFileDto,
  ): Promise<unknown> {
    if (!file) {
      throw new Error('file 필드가 필요합니다.');
    }
    return this.simplePaymentStatementService.validateFile('other-income', file, dto);
  }
}
