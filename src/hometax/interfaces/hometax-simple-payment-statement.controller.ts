import { Body, Controller, Get, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ValidateSimplePaymentStatementFileDto } from '../dto/simple-payment-statement.dto';
import { HometaxSimplePaymentStatementService } from '../services/hometax-simple-payment-statement.service';

@Controller('hometax/simple-payment-statements')
export class HometaxSimplePaymentStatementController {
  constructor(private readonly simplePaymentStatementService: HometaxSimplePaymentStatementService) {}

  @Get('profiles')
  profiles(): unknown {
    return this.simplePaymentStatementService.profiles();
  }

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
