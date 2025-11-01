import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    console.log('🔍 [JWT_STRATEGY] Payload recebido:', payload);
    console.log('🔍 [JWT_STRATEGY] firstName no payload:', payload.firstName);
    console.log('🔍 [JWT_STRATEGY] lastName no payload:', payload.lastName);
    console.log('🔍 [JWT_STRATEGY] document no payload:', payload.document);
    console.log('🔍 [JWT_STRATEGY] cref no payload:', payload.cref);

    const user = {
      id: payload.sub,
      email: payload.email,
      userType: payload.userType,
      firstName: payload.firstName,
      lastName: payload.lastName,
      document: payload.document,
      cref: payload.cref,
    };

    console.log('🔍 [JWT_STRATEGY] Usuário construído:', user);
    return user;
  }
}
