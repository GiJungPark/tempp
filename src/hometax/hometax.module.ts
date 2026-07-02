import { Module } from '@nestjs/common';
import { ElectronicFilingFileController } from './interfaces/electronic-filing-file.controller';
import { ElectronicFilingFileService } from './services/electronic-filing-file.service';
import { HometaxScrapingModule } from '../hometax-scraping/hometax-scraping.module';

// 홈택스 전자파일 생성 모듈은 국세청 전산매체 규격에 맞는 파일을 만드는 순수 생성 영역이다.
// 로그인, 쿠키, RAON 업로드, wqAction 같은 홈택스 화면 스크래핑 세부 구현은 HometaxScrapingModule에 숨긴다.
@Module({
  imports: [HometaxScrapingModule],
  controllers: [ElectronicFilingFileController],
  providers: [ElectronicFilingFileService],
})
export class HometaxModule {}
