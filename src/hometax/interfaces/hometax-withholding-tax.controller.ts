import { Body, Controller, Get, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SubmitWithholdingTaxDto, ValidateWithholdingTaxFileDto } from '../dto/withholding-tax.dto';
import { HometaxWithholdingTaxService } from '../services/hometax-withholding-tax.service';

@Controller('hometax/withholding-tax')
export class HometaxWithholdingTaxController {
  constructor(private readonly withholdingTaxService: HometaxWithholdingTaxService) {}

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

  @Get('submit-targets')
  getSubmitTargets(@Query('fleSbmsCvaId') fleSbmsCvaId: string): Promise<unknown> {
    if (!fleSbmsCvaId) {
      throw new Error('fleSbmsCvaId가 필요합니다.');
    }
    return this.withholdingTaxService.loadSubmitTargets(fleSbmsCvaId);
  }

  @Post('submit')
  submit(@Body() dto: SubmitWithholdingTaxDto): Promise<unknown> {
    return this.withholdingTaxService.submit(dto);
  }
}
