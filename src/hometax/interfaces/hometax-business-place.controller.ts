import { Controller, Get } from '@nestjs/common';
import { HometaxBusinessPlaceService } from '../services/hometax-business-place.service';

@Controller('hometax/business-places')
export class HometaxBusinessPlaceController {
  constructor(private readonly businessPlaceService: HometaxBusinessPlaceService) {}

  @Get()
  getBusinessPlaces(): Promise<unknown> {
    return this.businessPlaceService.getBusinessPlaces();
  }
}
