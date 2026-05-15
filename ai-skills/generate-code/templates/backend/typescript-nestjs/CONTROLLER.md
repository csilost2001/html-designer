# TypeScript NestJS — Controller テンプレート

ProcessFlow の `actions[].httpRoute` から `@Controller` クラスを生成する。

## フィールドマッピング

| ProcessFlow JSON フィールド | NestJS 生成物 |
|---|---|
| `actions[].httpRoute.method` | `@Get()` / `@Post()` / `@Put()` / `@Delete()` / `@Patch()` |
| `actions[].httpRoute.path` | `@Controller(path)` / `@Get(subpath)` |
| `actions[].httpRoute.auth: "required"` | `@UseGuards(SessionGuard)` / `@UseGuards(JwtAuthGuard)` |
| `actions[].inputs[]` | `@Body() dto: RequestDto` / `@Param()` / `@Query()` |
| `actions[].responses[]` | `@HttpCode(status)` |
| `context.ambientVariables` | `@Session()` / `@Req()` 経由で取得 |

## テンプレート本体

```typescript
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Session,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { {{processFlow.meta.name | toPascalCase}}Service } from './{{processFlow.meta.name | toKebabCase}}.service';
import { {{processFlow.actions[0].name | toPascalCase}}RequestDto } from './dto/{{processFlow.actions[0].name | toKebabCase}}-request.dto';
import { {{processFlow.actions[0].name | toPascalCase}}ResponseDto } from './dto/{{processFlow.actions[0].name | toKebabCase}}-response.dto';
// import { SessionGuard } from '../auth/session.guard'; // auth.method=session の場合
// import { JwtAuthGuard } from '../auth/jwt.guard';     // auth.method=jwt の場合

/**
 * {{processFlow.meta.name}} コントローラ。
 *
 * ProcessFlow: {{processFlow.meta.id}}
 * httpRoute: {{processFlow.actions[0].httpRoute.method}} {{processFlow.actions[0].httpRoute.path}}
 */
@Controller('{{processFlow.actions[0].httpRoute.path | basePath}}')
// @UseGuards(SessionGuard)  // httpRoute.auth = "required" の場合
export class {{processFlow.meta.name | toPascalCase}}Controller {
  constructor(
    private readonly {{processFlow.meta.name | toCamelCase}}Service: {{processFlow.meta.name | toPascalCase}}Service,
  ) {}

  /**
   * {{processFlow.actions[0].name}}。
   *
   * POST {{processFlow.actions[0].httpRoute.path}}
   *
   * @param dto リクエスト DTO
   * @param req リクエスト (セッション取得用)
   * @returns {{processFlow.actions[0].name}}ResponseDto
   */
  @Post('{{processFlow.actions[0].httpRoute.path | pathSuffix}}')
  @HttpCode(HttpStatus.OK)
  async {{processFlow.actions[0].name | toCamelCase}}(
    @Body() dto: {{processFlow.actions[0].name | toPascalCase}}RequestDto,
    @Req() req: Request,
  ): Promise<{{processFlow.actions[0].name | toPascalCase}}ResponseDto> {
    // ambientVariables: sessionCustomerId
    const sessionCustomerId: number = (req.session as any)?.customerId;

    return this.{{processFlow.meta.name | toCamelCase}}Service.execute(dto, sessionCustomerId);
  }
}
```

## DTO テンプレート (Request)

```typescript
// {{processFlow.actions[0].name | toKebabCase}}-request.dto.ts
import { IsNotEmpty, IsString, IsIn, MaxLength, Matches } from 'class-validator';

/**
 * {{processFlow.actions[0].name}} リクエスト DTO。
 * ProcessFlow inputs[] から生成。
 */
export class {{processFlow.actions[0].name | toPascalCase}}RequestDto {
  // ProcessFlow inputs[] を展開:
  // 例:
  // @IsNotEmpty({ message: '配送先郵便番号は必須です。' })
  // @Matches(/^\d{7}$/, { message: '郵便番号はハイフンなし 7 桁の数字で入力してください。' })
  // shippingPostalCode: string;
  //
  // @IsNotEmpty({ message: '配送先住所は必須です。' })
  // @MaxLength(300, { message: '配送先住所は 300 文字以内で入力してください。' })
  // shippingAddress: string;
  //
  // @IsIn(['credit_card', 'bank_transfer', 'cod'], { message: '支払方法は credit_card / bank_transfer / cod のいずれかを指定してください。' })
  // paymentMethod: string;
  //
  // @IsString()
  // note?: string;
}
```

## DTO テンプレート (Response)

```typescript
// {{processFlow.actions[0].name | toKebabCase}}-response.dto.ts

/**
 * {{processFlow.actions[0].name}} レスポンス DTO。
 * ProcessFlow outputs[] から生成。
 */
export class {{processFlow.actions[0].name | toPascalCase}}ResponseDto {
  // ProcessFlow outputs[] を展開:
  // 例:
  // orderId: number;
  // orderNumber: string;
  // totalAmount: number;
}
```

## HTTP メソッド変換

| ProcessFlow `httpRoute.method` | NestJS デコレータ |
|---|---|
| `"GET"` | `@Get()` |
| `"POST"` | `@Post()` |
| `"PUT"` | `@Put()` |
| `"DELETE"` | `@Delete()` |
| `"PATCH"` | `@Patch()` |
