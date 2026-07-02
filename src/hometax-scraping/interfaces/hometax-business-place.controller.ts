import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HometaxBusinessPlaceService } from '../services/hometax-business-place.service';

@ApiTags('business-places')
@Controller('hometax/business-places')
export class HometaxBusinessPlaceController {
  constructor(private readonly businessPlaceService: HometaxBusinessPlaceService) {}

  @ApiOperation({ summary: '사업장 정보 조회', description: '로그인된 홈택스 세션으로 사업장 목록/기본 정보를 조회합니다.' })
  @ApiOkResponse({ description: '홈택스 사업장 조회 응답 원문/요약' })
  @Get()
  getBusinessPlaces(): Promise<unknown> {
    return this.businessPlaceService.getBusinessPlaces();
  }
}
