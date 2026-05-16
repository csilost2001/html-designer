# TypeScript NestJS — Entity テンプレート (TypeORM)

ProcessFlow の `lineage.reads / lineage.writes` で参照されるテーブルから TypeORM Entity を生成する。

## テンプレート本体

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';

/**
 * {{table.name}} エンティティ。
 *
 * テーブル: {{table.physicalName}}
 * ProcessFlow 参照: {{processFlow.meta.id}}
 */
@Entity('{{table.physicalName}}')
// @Unique(['orderNumber'])  // unique 制約がある場合
export class {{table.physicalName | toPascalCase}} {
  @PrimaryGeneratedColumn('increment')
  id: number;

  // --- カラム (テーブル定義の columns[] から展開) ---
  // 例:
  // @Column({ name: 'order_number', type: 'varchar', length: 20, nullable: false, unique: true })
  // orderNumber: string;
  //
  // @Column({ name: 'customer_id', type: 'bigint', nullable: false })
  // customerId: number;
  //
  // @Column({ name: 'status', type: 'varchar', length: 20, nullable: false, default: 'pending' })
  // status: string;
  //
  // @Column({ name: 'total_amount', type: 'bigint', nullable: false })
  // totalAmount: number;
  //
  // @Column({ name: 'payment_method', type: 'varchar', length: 30, nullable: true })
  // paymentMethod: string | null;
  //
  // @Column({ name: 'note', type: 'text', nullable: true })
  // note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

## データ型変換 (TypeORM)

| DB カラム型 | TypeORM `type` | TypeScript 型 |
|---|---|---|
| `VARCHAR(n)` | `'varchar'` | `string` |
| `TEXT` | `'text'` | `string` |
| `INTEGER` | `'int'` | `number` |
| `BIGINT` | `'bigint'` | `number` / `string` (big int 注意) |
| `BOOLEAN` | `'boolean'` | `boolean` |
| `TIMESTAMP` | `'timestamp'` | `Date` |
| `DATE` | `'date'` | `Date` |
| `DECIMAL(p,s)` | `'decimal'` | `string` (TypeORM は string で返す) |

## Module テンプレート

```typescript
// {{processFlow.meta.name | toKebabCase}}.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { {{processFlow.meta.name | toPascalCase}}Controller } from './{{processFlow.meta.name | toKebabCase}}.controller';
import { {{processFlow.meta.name | toPascalCase}}Service } from './{{processFlow.meta.name | toKebabCase}}.service';
// import { {{table.physicalName | toPascalCase}} } from './entity/{{table.physicalName | toKebabCase}}.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // ProcessFlow lineage.writes のテーブルエンティティを列挙
      // {{table.physicalName | toPascalCase}},
    ]),
  ],
  controllers: [{{processFlow.meta.name | toPascalCase}}Controller],
  providers: [{{processFlow.meta.name | toPascalCase}}Service],
  exports: [{{processFlow.meta.name | toPascalCase}}Service],
})
export class {{processFlow.meta.name | toPascalCase}}Module {}
```
