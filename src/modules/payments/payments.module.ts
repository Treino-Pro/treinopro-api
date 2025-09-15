import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MercadoPagoService } from './mercadopago.service';
import { FinancialProfileService } from './financial-profile.service';
import { StudentPaymentMethodsService } from './student-payment-methods.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService, 
    MercadoPagoService, 
    FinancialProfileService,
    StudentPaymentMethodsService
  ],
  exports: [
    PaymentsService, 
    MercadoPagoService, 
    FinancialProfileService,
    StudentPaymentMethodsService
  ],
})
export class PaymentsModule {}
