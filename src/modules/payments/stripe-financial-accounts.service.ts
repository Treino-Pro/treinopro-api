import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { financialProfiles, users } from '../../database/schema';
import { PaymentMethod } from './dto/financial-profile.dto';
import { StripeConnectService } from './stripe-connect.service';

export interface StripeRequirementsStatus {
  currentlyDue: string[];
  eventuallyDue: string[];
  pastDue: string[];
  pendingVerification: string[];
  disabledReason: string | null;
}

export interface StripeConnectedAccountStatus {
  accountId: string;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: StripeRequirementsStatus;
}

@Injectable()
export class StripeFinancialAccountsService {
  private readonly logger = new Logger(StripeFinancialAccountsService.name);

  constructor(
    @Inject('DATABASE_CONNECTION') private readonly db: any,
    private readonly stripeConnectService: StripeConnectService,
  ) {}

  async ensureConnectedAccount(
    userId: string,
  ): Promise<StripeConnectedAccountStatus> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.userType !== 'personal') {
      throw new ForbiddenException(
        'Apenas personal trainers podem configurar recebimento',
      );
    }

    const profile = await this.db.query.financialProfiles.findFirst({
      where: eq(financialProfiles.userId, userId),
    });

    if (profile?.stripeAccountId) {
      const account = await this.stripeConnectService.retrieveAccount(
        profile.stripeAccountId,
      );
      return this.syncConnectedAccountStatus({ userId, account });
    }

    const account = await this.stripeConnectService.createRecipientAccount({
      email: user.email,
      displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      country: 'BR',
      givenName: user.firstName,
      familyName: user.lastName,
      metadata: {
        userId: user.id,
        userType: user.userType,
        documentNumber: user.documentNumber || '',
      },
    });

    return this.syncConnectedAccountStatus({ userId, account, profile });
  }

  async createEmbeddedOnboardingSession(userId: string): Promise<{
    accountId: string;
    clientSecret: string;
    expiresAt?: number;
  }> {
    const account = await this.ensureConnectedAccount(userId);
    const session =
      await this.stripeConnectService.createEmbeddedOnboardingSession({
        accountId: account.accountId,
      });

    return {
      accountId: account.accountId,
      clientSecret: session.client_secret,
      expiresAt: session.expires_at,
    };
  }

  async syncConnectedAccountStatus(input: {
    userId?: string;
    account: any;
    profile?: any;
  }): Promise<StripeConnectedAccountStatus | null> {
    const profile =
      input.profile ||
      (await this.findProfileForSync(input.userId, input.account?.id));

    if (!profile && !input.userId) {
      this.logger.warn(
        `Perfil financeiro não encontrado para conta Stripe ${input.account?.id}`,
      );
      return null;
    }

    const status = this.mapAccountStatus(input.account);
    const persistedProfile = await this.persistStripeStatus(
      profile || { userId: input.userId },
      status,
    );

    return {
      accountId: persistedProfile.stripeAccountId,
      onboardingComplete: persistedProfile.stripeOnboardingCompleted,
      chargesEnabled: persistedProfile.stripeChargesEnabled,
      payoutsEnabled: persistedProfile.stripePayoutsEnabled,
      detailsSubmitted: persistedProfile.stripeDetailsSubmitted,
      requirements: persistedProfile.stripeRequirements,
    };
  }

  async handleAccountUpdated(event: {
    type: string;
    data?: { object?: any };
    related_object?: { id?: string; type?: string };
  }): Promise<void> {
    if (!this.isAccountStatusEvent(event)) {
      return;
    }

    const eventAccount = event?.data?.object;
    if (eventAccount?.id) {
      await this.syncConnectedAccountStatus({
        account: eventAccount,
      });
      return;
    }

    const accountId = event?.related_object?.id;
    if (!accountId) {
      return;
    }

    const account = await this.stripeConnectService.retrieveAccount(accountId);
    await this.syncConnectedAccountStatus({
      account,
    });
  }

  isStripePayoutReady(profile: any): boolean {
    if (!profile?.stripeAccountId) {
      return false;
    }

    const requirements = this.normalizeRequirements(profile.stripeRequirements);

    return Boolean(
      profile.stripeDetailsSubmitted &&
        profile.stripePayoutsEnabled &&
        requirements.currentlyDue.length === 0 &&
        requirements.pastDue.length === 0,
    );
  }

  private async findProfileForSync(
    userId?: string,
    accountId?: string,
  ): Promise<any | null> {
    if (userId) {
      return this.db.query.financialProfiles.findFirst({
        where: eq(financialProfiles.userId, userId),
      });
    }

    if (accountId) {
      return this.db.query.financialProfiles.findFirst({
        where: eq(financialProfiles.stripeAccountId, accountId),
      });
    }

    return null;
  }

  private async persistStripeStatus(
    profile: any,
    status: StripeConnectedAccountStatus,
  ): Promise<any> {
    const updateData = {
      preferredMethod: profile.preferredMethod || PaymentMethod.BANK_TRANSFER,
      stripeAccountId: status.accountId,
      stripeAccountMode: 'recipient',
      stripeOnboardingCompleted: status.onboardingComplete,
      stripeChargesEnabled: status.chargesEnabled,
      stripePayoutsEnabled: status.payoutsEnabled,
      stripeDetailsSubmitted: status.detailsSubmitted,
      stripeRequirements: status.requirements,
      canReceivePayments: status.onboardingComplete,
      isComplete: Boolean(profile.isComplete || status.detailsSubmitted),
      verificationStatus: status.onboardingComplete ? 'verified' : 'pending',
      verifiedAt: status.onboardingComplete ? new Date() : profile.verifiedAt,
      lastUpdatedAt: new Date(),
      updatedAt: new Date(),
    };

    if (profile?.id) {
      const [updatedProfile] = await this.db
        .update(financialProfiles)
        .set(updateData)
        .where(eq(financialProfiles.id, profile.id))
        .returning();

      return updatedProfile;
    }

    const [createdProfile] = await this.db
      .insert(financialProfiles)
      .values({
        userId: profile.userId,
        ...updateData,
      })
      .returning();

    return createdProfile;
  }

  private mapAccountStatus(account: any): StripeConnectedAccountStatus {
    const requirements = this.normalizeRequirements(account?.requirements);
    const payoutsEnabled = this.resolvePayoutsEnabled(account);
    const chargesEnabled = this.resolveChargesEnabled(account);
    const detailsSubmitted =
      typeof account?.details_submitted === 'boolean'
        ? account.details_submitted
        : this.resolveV2DetailsSubmitted({
            chargesEnabled,
            payoutsEnabled,
            requirements,
          });
    const onboardingComplete =
      detailsSubmitted &&
      payoutsEnabled &&
      requirements.currentlyDue.length === 0 &&
      requirements.pastDue.length === 0;

    return {
      accountId: account.id,
      onboardingComplete,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      requirements,
    };
  }

  private isAccountStatusEvent(event?: {
    type?: string;
    related_object?: { type?: string };
  }): boolean {
    if (event?.type === 'account.updated') {
      return true;
    }

    return Boolean(
      event?.type?.startsWith('v2.core.account') &&
        (!event.related_object?.type ||
          event.related_object.type === 'v2.core.account'),
    );
  }

  private resolveV2DetailsSubmitted(input: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    requirements: StripeRequirementsStatus;
  }): boolean {
    return Boolean(
      (input.chargesEnabled || input.payoutsEnabled) &&
        input.requirements.currentlyDue.length === 0 &&
        input.requirements.pastDue.length === 0,
    );
  }

  private resolvePayoutsEnabled(account: any): boolean {
    if (typeof account?.payouts_enabled === 'boolean') {
      return account.payouts_enabled;
    }

    return (
      account?.configuration?.recipient?.capabilities?.stripe_balance
        ?.stripe_transfers?.status === 'active'
    );
  }

  private resolveChargesEnabled(account: any): boolean {
    if (typeof account?.charges_enabled === 'boolean') {
      return account.charges_enabled;
    }

    return (
      account?.configuration?.merchant?.capabilities?.card_payments?.status ===
      'active'
    );
  }

  private normalizeRequirements(raw: any): StripeRequirementsStatus {
    const requirements = raw || {};
    const entries = Array.isArray(requirements.entries)
      ? requirements.entries
      : [];

    if (entries.length > 0) {
      const toRequirement = (entry: any): string =>
        entry?.reference || entry?.description || 'unknown_requirement';
      const userActionEntries = entries.filter(
        (entry: any) => entry?.awaiting_action_from === 'user',
      );

      return {
        currentlyDue: userActionEntries.map(toRequirement),
        eventuallyDue: [],
        pastDue: entries
          .filter((entry: any) => entry?.minimum_deadline?.status === 'past_due')
          .map(toRequirement),
        pendingVerification: entries
          .filter((entry: any) => entry?.awaiting_action_from === 'stripe')
          .map(toRequirement),
        disabledReason:
          requirements.summary?.disabled_reason ??
          requirements.summary?.disabledReason ??
          null,
      };
    }

    return {
      currentlyDue: Array.isArray(requirements.currently_due)
        ? requirements.currently_due
        : Array.isArray(requirements.currentlyDue)
          ? requirements.currentlyDue
          : [],
      eventuallyDue: Array.isArray(requirements.eventually_due)
        ? requirements.eventually_due
        : Array.isArray(requirements.eventuallyDue)
          ? requirements.eventuallyDue
          : [],
      pastDue: Array.isArray(requirements.past_due)
        ? requirements.past_due
        : Array.isArray(requirements.pastDue)
          ? requirements.pastDue
          : [],
      pendingVerification: Array.isArray(requirements.pending_verification)
        ? requirements.pending_verification
        : Array.isArray(requirements.pendingVerification)
          ? requirements.pendingVerification
          : [],
      disabledReason:
        requirements.disabled_reason ?? requirements.disabledReason ?? null,
    };
  }
}
