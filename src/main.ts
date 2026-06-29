import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Hometax API')
    .setDescription('홈택스 간편인증, 사업장 조회, 전자파일 생성, 전자신고 업로드/검증 POC API 명세')
    .setVersion('0.1.0')
    .addTag('auth', '홈택스 간편인증과 세션 관리')
    .addTag('business-places', '홈택스 사업장 정보 조회')
    .addTag('electronic-files', '원천세/간이지급명세서/지급명세서 전자파일 생성')
    .addTag('withholding-tax', '원천세 변환파일 업로드, 검증, 제출')
    .addTag('simple-payment-statements', '간이지급명세서 변환파일 업로드, 검증')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, swaggerDocument);

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}

void bootstrap();
