import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ElectronicBusinessPlaceDto,
  GenerateAnnualBusinessIncomeStatementFileDto,
  GenerateAnnualOtherIncomeStatementFileDto,
  GeneratedElectronicFileDto,
  GenerateSimpleBusinessIncomeStatementFileDto,
  GenerateSimpleOtherIncomeStatementFileDto,
  GenerateWithholdingTaxFileDto,
} from '../dto/electronic-filing.dto';
import { ElectronicFilingFileService } from '../services/electronic-filing-file.service';
import { GeneratedElectronicFile } from '../efile/fixed-width';
import { HometaxBusinessPlaceService } from '../services/hometax-business-place.service';

// 홈택스 업로드 API와 별개로, 전자파일 텍스트 자체를 만들어주는 API다.
// 반환값의 contentBase64를 파일로 저장하거나 곧바로 업로드 검증 API에 넘길 수 있다.
@ApiTags('electronic-files')
@Controller('hometax/electronic-files')
export class ElectronicFilingFileController {
  constructor(
    private readonly electronicFilingFileService: ElectronicFilingFileService,
    private readonly businessPlaceService: HometaxBusinessPlaceService,
  ) {}

  // 원천징수이행상황신고서(C103900) 파일 생성.
  // Swagger에는 기획서 기준 사용자 입력만 노출하고, 제출연월/작성일/신고상세코드 등은 service 기본값을 쓴다.
  @ApiOperation({
    summary: '원천세 전자파일 생성',
    description:
      'C103900 원천징수이행상황신고서 21/22/23 레코드를 생성합니다. 사용자 입력은 지급연월, 귀속연월, 소득자 목록 중심이며 제출연월, 작성일, 신고상세코드, 사업장 정보는 서버 기본값 또는 홈택스 사업장 조회값으로 채웁니다.',
  })
  @ApiOkResponse({ type: GeneratedElectronicFileDto })
  @Post('withholding-tax')
  async generateWithholdingTax(@Body() dto: GenerateWithholdingTaxFileDto): Promise<GeneratedElectronicFile> {
    return this.electronicFilingFileService.generateWithholdingTax(await this.withBusinessPlace(dto));
  }

  // 간이지급명세서(거주자의 사업소득) 파일 생성.
  // 지급연도/지급월은 사용자가 지급날짜를 넣으면 paymentDate에서 계산한다.
  @ApiOperation({
    summary: '사업소득 간이지급명세서 전자파일 생성',
    description:
      '간이지급명세서(거주자의 사업소득) A/B/C 레코드를 생성합니다. 지급연도, 지급월, 상하반기, 제출일은 지급날짜와 서버 기본값으로 계산합니다.',
  })
  @ApiOkResponse({ type: GeneratedElectronicFileDto })
  @Post('simple-payment-statements/business-income')
  async generateSimpleBusinessIncome(
    @Body() dto: GenerateSimpleBusinessIncomeStatementFileDto,
  ): Promise<GeneratedElectronicFile> {
    return this.electronicFilingFileService.generateSimpleBusinessIncome(await this.withBusinessPlace(dto));
  }

  // 간이지급명세서(거주자의 기타소득) 파일 생성.
  // 필요경비율/세율은 전산매체 규격과 기획 기본 정책에 맞춰 service에서 계산한다.
  @ApiOperation({
    summary: '기타소득 간이지급명세서 전자파일 생성',
    description:
      '간이지급명세서(거주자의 기타소득) A/B/C 레코드를 생성합니다. 지급연도, 지급월, 제출일, 필요경비, 세율은 입력값과 기본 정책으로 계산합니다.',
  })
  @ApiOkResponse({ type: GeneratedElectronicFileDto })
  @Post('simple-payment-statements/other-income')
  async generateSimpleOtherIncome(
    @Body() dto: GenerateSimpleOtherIncomeStatementFileDto,
  ): Promise<GeneratedElectronicFile> {
    return this.electronicFilingFileService.generateSimpleOtherIncome(await this.withBusinessPlace(dto));
  }

  // 연간 사업소득 지급명세서 파일 생성.
  // 귀속연도는 첫 번째 소득자의 귀속연월에서 파생한다.
  @ApiOperation({
    summary: '연간 사업소득 지급명세서 전자파일 생성',
    description:
      '연간 사업소득 지급명세서 A/B/C 레코드를 생성합니다. 귀속연도, 제출일, 제출대상기간코드는 서버가 기본값으로 채웁니다.',
  })
  @ApiOkResponse({ type: GeneratedElectronicFileDto })
  @Post('annual-payment-statements/business-income')
  async generateAnnualBusinessIncome(
    @Body() dto: GenerateAnnualBusinessIncomeStatementFileDto,
  ): Promise<GeneratedElectronicFile> {
    return this.electronicFilingFileService.generateAnnualBusinessIncome(await this.withBusinessPlace(dto));
  }

  // 연간 기타소득 지급명세서 파일 생성.
  // 서화/골동품 소득구분 64처럼 별도 D레코드가 필요한 케이스는 service에서 막는다.
  @ApiOperation({
    summary: '연간 기타소득 지급명세서 전자파일 생성',
    description:
      '연간 기타소득 지급명세서 A/B/C 레코드를 생성합니다. 귀속연도, 제출일, 제출대상기간코드는 서버가 기본값으로 채우며, 별도 D레코드가 필요한 소득구분은 현재 생성하지 않습니다.',
  })
  @ApiOkResponse({ type: GeneratedElectronicFileDto })
  @Post('annual-payment-statements/other-income')
  async generateAnnualOtherIncome(
    @Body() dto: GenerateAnnualOtherIncomeStatementFileDto,
  ): Promise<GeneratedElectronicFile> {
    return this.electronicFilingFileService.generateAnnualOtherIncome(await this.withBusinessPlace(dto));
  }

  // Swagger에서 숨긴 businessPlace는 홈택스 사업장 조회 결과로 채운다.
  // 테스트/디버깅 때 body에 직접 넣은 값이 있으면 그 값을 우선해서 사용할 수 있게 남겨둔다.
  private async withBusinessPlace<T extends { businessPlace?: ElectronicBusinessPlaceDto }>(dto: T): Promise<T> {
    if (dto.businessPlace) {
      return dto;
    }

    return {
      ...dto,
      businessPlace: await this.businessPlaceService.getDefaultElectronicBusinessPlace(),
    };
  }
}
