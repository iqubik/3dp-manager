import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Put,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  findAll() {
    return this.subscriptionsService.findAll();
  }

  @Post()
  create(@Body() createSubscriptionDto: CreateSubscriptionDto) {
    return this.subscriptionsService.create(createSubscriptionDto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateSubscriptionDto: CreateSubscriptionDto,
  ) {
    return this.subscriptionsService.update(id, updateSubscriptionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.subscriptionsService.remove(id);
  }

  @Put('bulk-auto-rotation')
  @HttpCode(HttpStatus.OK)
  async bulkUpdateAutoRotation(
    @Body() body: { subscriptionIds: string[]; enabled: boolean },
  ) {
    const { subscriptionIds, enabled } = body;

    if (!Array.isArray(subscriptionIds)) {
      return {
        success: false,
        message: 'subscriptionIds должен быть массивом',
      };
    }

    const updated: string[] = [];
    for (const id of subscriptionIds) {
      try {
        await this.subscriptionsService.update(id, {
          name: '',
          isAutoRotationEnabled: enabled,
        });
        updated.push(id);
      } catch {
        // Пропускаем неудачные обновления
      }
    }

    return {
      success: true,
      message: `Обновлено ${updated.length} подписок`,
      updatedCount: updated.length,
      updatedIds: updated,
    };
  }
}
