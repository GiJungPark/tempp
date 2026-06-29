import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  GenerateAnnualBusinessIncomeStatementFileDto,
  GenerateAnnualOtherIncomeStatementFileDto,
  GeneratedElectronicFileDto,
  GenerateSimpleBusinessIncomeStatementFileDto,
  GenerateSimpleOtherIncomeStatementFileDto,
  GenerateWithholdingTaxFileDto,
} from '../dto/electronic-filing.dto';
import { ElectronicFilingFileService } from '../services/electronic-filing-file.service';
import { GeneratedElectronicFile } from '../efile/fixed-width';

// 홈택스 업로드 API와 별개로, 전자파일 텍스트 자체를 만들어주는 API다.
// 반환값의 contentBase64를 파일로 저장하거나 곧바로 업로드 검증 API에 넘길 수 있다.
@ApiTags('electronic-files')
@Controller('hometax/electronic-files')
export class ElectronicFilingFileController {
  constructor(private readonly electronicFilingFileService: ElectronicFilingFileService) {}

  // 원천징수이행상황신고서(C103900) 파일 생성.
  @ApiOperation({ summary: '원천세 전자파일 생성', description: 'C103900 원천징수이행상황신고서 21/22/23 레코드를 생성합니다.' })
  @ApiOkResponse({ type: GeneratedElectronicFileDto })
  @Post('withholding-tax')
  generateWithholdingTax(@Body() dto: GenerateWithholdingTaxFileDto): GeneratedElectronicFile {
    return this.electronicFilingFileService.generateWithholdingTax(dto);
  }

  // 간이지급명세서(거주자의 사업소득) 파일 생성.
  @ApiOperation({ summary: '사업소득 간이지급명세서 전자파일 생성' })
  @ApiOkResponse({ type: GeneratedElectronicFileDto })
  @Post('simple-payment-statements/business-income')
  generateSimpleBusinessIncome(@Body() dto: GenerateSimpleBusinessIncomeStatementFileDto): GeneratedElectronicFile {
    return this.electronicFilingFileService.generateSimpleBusinessIncome(dto);
  }

  // 간이지급명세서(거주자의 기타소득) 파일 생성.
  @ApiOperation({ summary: '기타소득 간이지급명세서 전자파일 생성' })
  @ApiOkResponse({ type: GeneratedElectronicFileDto })
  @Post('simple-payment-statements/other-income')
  generateSimpleOtherIncome(@Body() dto: GenerateSimpleOtherIncomeStatementFileDto): GeneratedElectronicFile {
    return this.electronicFilingFileService.generateSimpleOtherIncome(dto);
  }

  // 연간 사업소득 지급명세서 파일 생성.
  @ApiOperation({ summary: '연간 사업소득 지급명세서 전자파일 생성' })
  @ApiOkResponse({ type: GeneratedElectronicFileDto })
  @Post('annual-payment-statements/business-income')
  generateAnnualBusinessIncome(@Body() dto: GenerateAnnualBusinessIncomeStatementFileDto): GeneratedElectronicFile {
    return this.electronicFilingFileService.generateAnnualBusinessIncome(dto);
  }

  // 연간 기타소득 지급명세서 파일 생성.
  @ApiOperation({ summary: '연간 기타소득 지급명세서 전자파일 생성' })
  @ApiOkResponse({ type: GeneratedElectronicFileDto })
  @Post('annual-payment-statements/other-income')
  generateAnnualOtherIncome(@Body() dto: GenerateAnnualOtherIncomeStatementFileDto): GeneratedElectronicFile {
    return this.electronicFilingFileService.generateAnnualOtherIncome(dto);
  }
}
