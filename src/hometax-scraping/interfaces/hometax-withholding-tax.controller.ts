import { Body, Controller, Get, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { SubmitWithholdingTaxDto, ValidateWithholdingTaxFileDto } from '../dto/withholding-tax.dto';
import { HometaxWithholdingTaxService } from '../services/hometax-withholding-tax.service';

@ApiTags('dev-withholding-tax')
@Controller('dev/hometax/withholding-tax')
export class DevHometaxWithholdingTaxController {
  constructor(private readonly withholdingTaxService: HometaxWithholdingTaxService) {}

  @ApiOperation({ summary: '원천세 변환파일 업로드/검증', description: 'multipart file을 RAON 업로드 후 홈택스 원천세 형식/내용 검증 상태를 조회합니다.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: '원천세 전자파일' },
        rtnClCd: { type: 'string', example: '01' },
        rtnClDetailCd: { type: 'string', example: '01' },
        stmnKndCd: { type: 'string' },
        encryptedPassword: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({ description: '검증 상태. READY_TO_SUBMIT이면 제출 가능' })
  @Post('validate')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        files: 1,
        fileSize: 1024 * 1024 * 200,
      },
    }),
  )
  validateFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ValidateWithholdingTaxFileDto,
  ): Promise<unknown> {
    if (!file) {
      throw new Error('file 필드가 필요합니다.');
    }
    return this.withholdingTaxService.validateFile(file, dto);
  }

  @ApiOperation({ summary: '원천세 제출대상 조회' })
  @ApiQuery({ name: 'fleSbmsCvaId', description: '검증 완료 후 받은 제출 민원 ID', example: '202606910000005258941859' })
  @ApiOkResponse({ description: '홈택스 제출대상 조회 응답' })
  @Get('submit-targets')
  getSubmitTargets(@Query('fleSbmsCvaId') fleSbmsCvaId: string): Promise<unknown> {
    if (!fleSbmsCvaId) {
      throw new Error('fleSbmsCvaId가 필요합니다.');
    }
    return this.withholdingTaxService.loadSubmitTargets(fleSbmsCvaId);
  }

  @ApiOperation({ summary: '원천세 최종 제출', description: '실제 신고 제출이 발생하므로 confirmSubmit=true가 필요합니다.' })
  @ApiOkResponse({ description: '홈택스 최종 제출 응답' })
  @Post('submit')
  submit(@Body() dto: SubmitWithholdingTaxDto): Promise<unknown> {
    return this.withholdingTaxService.submit(dto);
  }
}
