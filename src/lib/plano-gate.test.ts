import { describe, expect, it } from 'vitest';
import {
  STATUS_BLOQUEADOS,
  extrairEmpresa,
  planStatusBruto,
  planoBloqueado,
  podeGerenciarAssinatura,
  statusPlano,
} from './plano-gate';

const AUTH_ID = '11111111-1111-4111-8111-111111111111';
const OUTRO_AUTH_ID = '22222222-2222-4222-8222-222222222222';
const USUARIOS_ID = '99999999-9999-4999-8999-999999999999';

/**
 * Profile no formato real: linha de `usuarios` com `empresas(*)` aninhado e,
 * dentro dela, o embed `empresa_assinaturas(*)`.
 *
 * Por padrão o status vai na assinatura, que é onde ele mora de verdade.
 * `naEmpresa` força o formato alternativo, e `assinaturaComoArray` simula o
 * PostgREST devolvendo lista em vez de objeto.
 */
function profileFake(
  over: {
    role?: string;
    planStatus?: unknown;
    semEmpresa?: boolean;
    semAssinatura?: boolean;
    naEmpresa?: boolean;
    assinaturaComoArray?: boolean;
    ownerId?: string;
    deletedAt?: string | null;
    empresasComoArray?: boolean;
    fimDoPeriodo?: string | null;
  } = {},
) {
  const empresa: Record<string, unknown> = {
    id: 'empresa-1',
    nome: 'Construtora Meridiano',
    owner_id: over.ownerId ?? AUTH_ID,
  };

  if ('planStatus' in over) {
    if (over.naEmpresa) {
      empresa.plan_status = over.planStatus;
    } else {
      const assinatura: Record<string, unknown> = {
        empresa_id: 'empresa-1',
        plan_status: over.planStatus,
      };
      if ('fimDoPeriodo' in over) assinatura.current_period_end = over.fimDoPeriodo;
      empresa.empresa_assinaturas = over.assinaturaComoArray ? [assinatura] : assinatura;
    }
  } else if (!over.semAssinatura) {
    // Empresa com assinatura embutida mas sem status: o estado logo após a
    // migration criar a linha, antes de qualquer evento de cobrança.
    empresa.empresa_assinaturas = null;
  }

  return {
    id: USUARIOS_ID,
    user_id: AUTH_ID,
    role: over.role ?? 'gestor',
    empresa_id: over.semEmpresa ? null : 'empresa-1',
    deleted_at: over.deletedAt ?? null,
    empresas: over.semEmpresa ? null : over.empresasComoArray ? [empresa] : empresa,
  };
}

const sessionFake = (userId: string = AUTH_ID) => ({ user: { id: userId } });
/** Sessão existente mas sem usuário resolvido — não dá para usar sessionFake(undefined),
 *  porque passar undefined a um parâmetro com valor padrão ativa o próprio padrão. */
const sessionSemUsuario = () => ({ user: undefined });

describe('planoBloqueado — libera quando não sabe (o núcleo do desenho)', () => {
  it('libera sem profile (caminho do safetyTimer)', () => {
    expect(planoBloqueado(null)).toBe(false);
    expect(planoBloqueado(undefined)).toBe(false);
  });

  it('libera quando a assinatura ainda não existe', () => {
    const p = profileFake();
    expect(p.empresas).not.toHaveProperty('plan_status');
    expect(planoBloqueado(p)).toBe(false);
  });

  it('libera quando o perfil veio sem o embed da assinatura (consulta de reserva)', () => {
    // É o formato que a consulta simples devolve quando o embed falha.
    expect(planoBloqueado(profileFake({ semAssinatura: true }))).toBe(false);
  });

  it('libera quando o objeto empresas está ausente', () => {
    expect(planoBloqueado(profileFake({ semEmpresa: true }))).toBe(false);
  });

  it('libera com plan_status null, vazio ou só espaços', () => {
    expect(planoBloqueado(profileFake({ planStatus: null }))).toBe(false);
    expect(planoBloqueado(profileFake({ planStatus: '' }))).toBe(false);
    expect(planoBloqueado(profileFake({ planStatus: '   ' }))).toBe(false);
  });

  it('libera com plan_status de tipo inesperado', () => {
    expect(planoBloqueado(profileFake({ planStatus: 0 }))).toBe(false);
    expect(planoBloqueado(profileFake({ planStatus: {} }))).toBe(false);
    expect(planoBloqueado(profileFake({ planStatus: false }))).toBe(false);
  });

  it('libera status desconhecido — prova que é denylist e não allowlist', () => {
    expect(planoBloqueado(profileFake({ planStatus: 'status_do_futuro' }))).toBe(false);
    expect(planoBloqueado(profileFake({ planStatus: 'paused' }))).toBe(false);
  });

  it('não lança com entradas hostis', () => {
    expect(() => planoBloqueado({})).not.toThrow();
    expect(() => planoBloqueado({ empresas: 42 as never })).not.toThrow();
    expect(() => planoBloqueado(null)).not.toThrow();
    expect(planoBloqueado({ empresas: 42 as never })).toBe(false);
  });
});

describe('planoBloqueado — casos que devem bloquear', () => {
  it.each(STATUS_BLOQUEADOS)("bloqueia com plan_status '%s'", (status) => {
    expect(planoBloqueado(profileFake({ planStatus: status }))).toBe(true);
  });

  it('normaliza caixa e espaços antes de comparar', () => {
    expect(planoBloqueado(profileFake({ planStatus: 'INACTIVE' }))).toBe(true);
    expect(planoBloqueado(profileFake({ planStatus: '  inactive  ' }))).toBe(true);
    expect(planoBloqueado(profileFake({ planStatus: 'Canceled' }))).toBe(true);
  });

  it('aceita as duas grafias de cancelamento', () => {
    expect(planoBloqueado(profileFake({ planStatus: 'canceled' }))).toBe(true);
    expect(planoBloqueado(profileFake({ planStatus: 'cancelled' }))).toBe(true);
  });

  it('bloqueia o funcionário de empresa sem plano — ele herda o plano da empresa', () => {
    expect(planoBloqueado(profileFake({ role: 'vendedor', planStatus: 'inactive' }))).toBe(true);
  });
});

describe('planoBloqueado — políticas deliberadas', () => {
  it('não bloqueia em past_due (o Stripe ainda está tentando cobrar)', () => {
    expect(planoBloqueado(profileFake({ planStatus: 'past_due' }))).toBe(false);
  });

  it('não bloqueia em trialing nem incomplete', () => {
    expect(planoBloqueado(profileFake({ planStatus: 'trialing' }))).toBe(false);
    expect(planoBloqueado(profileFake({ planStatus: 'incomplete' }))).toBe(false);
  });

  it('libera plan_status active', () => {
    expect(planoBloqueado(profileFake({ planStatus: 'active' }))).toBe(false);
  });

  it('nunca bloqueia o admin global, mesmo com plano inativo', () => {
    const admin = profileFake({ role: 'admin', planStatus: 'inactive' });
    expect(planoBloqueado(admin)).toBe(false);
    expect(statusPlano(admin)).toBe('liberado');
  });

  it('a isenção do admin não depende da caixa do papel', () => {
    // `role` é texto livre no banco, sem enum que garanta a grafia.
    expect(planoBloqueado(profileFake({ role: 'Admin', planStatus: 'inactive' }))).toBe(false);
    expect(planoBloqueado(profileFake({ role: ' ADMIN ', planStatus: 'inactive' }))).toBe(false);
  });
});

describe('statusPlano — distingue liberado de desconhecido', () => {
  it('desconhecido sem profile ou sem a coluna', () => {
    expect(statusPlano(null)).toBe('desconhecido');
    expect(statusPlano(profileFake())).toBe('desconhecido');
  });

  it('liberado com status válido, bloqueado com status da denylist', () => {
    expect(statusPlano(profileFake({ planStatus: 'active' }))).toBe('liberado');
    expect(statusPlano(profileFake({ planStatus: 'inactive' }))).toBe('bloqueado');
  });
});

describe('extrairEmpresa e planStatusBruto', () => {
  it('lê empresas como objeto — o formato real do embed', () => {
    expect(extrairEmpresa(profileFake())?.id).toBe('empresa-1');
  });

  it('lê o primeiro item caso o PostgREST devolva array', () => {
    const p = profileFake({ planStatus: 'inactive', empresasComoArray: true });
    expect(extrairEmpresa(p)?.id).toBe('empresa-1');
    expect(planoBloqueado(p)).toBe(true);
  });

  it('devolve null para array vazio sem quebrar o gate', () => {
    expect(extrairEmpresa({ empresas: [] })).toBeNull();
    expect(planoBloqueado({ empresas: [] })).toBe(false);
  });

  it('planStatusBruto normaliza, ou devolve null quando desconhecido', () => {
    expect(planStatusBruto(profileFake({ planStatus: ' Active ' }))).toBe('active');
    expect(planStatusBruto(profileFake())).toBeNull();
    expect(planStatusBruto(null)).toBeNull();
  });

  it('lê o status da assinatura embutida — o formato real', () => {
    expect(planoBloqueado(profileFake({ planStatus: 'inactive' }))).toBe(true);
    expect(planoBloqueado(profileFake({ planStatus: 'active' }))).toBe(false);
  });

  it('lê a assinatura mesmo se o PostgREST devolver array', () => {
    expect(planoBloqueado(profileFake({ planStatus: 'inactive', assinaturaComoArray: true }))).toBe(
      true,
    );
  });

  it('também aceita o status direto na empresa, como reserva', () => {
    expect(planoBloqueado(profileFake({ planStatus: 'inactive', naEmpresa: true }))).toBe(true);
    expect(planStatusBruto(profileFake({ planStatus: 'canceled', naEmpresa: true }))).toBe('canceled');
  });
});

describe('podeGerenciarAssinatura', () => {
  it('true quando empresas.owner_id é o auth.users.id da sessão', () => {
    expect(podeGerenciarAssinatura(profileFake(), sessionFake(AUTH_ID))).toBe(true);
  });

  it('compara o dono com session.user.id e não com profile.id', () => {
    // Papel sem privilégio de gestor para isolar a comparação de dono: owner_id
    // guarda o auth.users.id, e se alguém trocar por profile.id isto quebra.
    const comOwnerErrado = profileFake({ role: 'vendedor', ownerId: USUARIOS_ID });
    expect(podeGerenciarAssinatura(comOwnerErrado, sessionFake(AUTH_ID))).toBe(false);

    const comOwnerCerto = profileFake({ role: 'vendedor', ownerId: AUTH_ID });
    expect(comOwnerCerto.id).not.toBe(AUTH_ID);
    expect(podeGerenciarAssinatura(comOwnerCerto, sessionFake(AUTH_ID))).toBe(true);
  });

  it('false para VENDEDOR que não é dono — quem não responde pela empresa não paga', () => {
    expect(
      podeGerenciarAssinatura(
        profileFake({ role: 'vendedor', ownerId: OUTRO_AUTH_ID }),
        sessionFake(AUTH_ID),
      ),
    ).toBe(false);
  });

  it('true para um SEGUNDO gestor que não é o dono registrado', () => {
    // Sem isto, uma empresa cujo dono saiu ou foi suspenso ficaria sem ninguém
    // capaz de reativar a assinatura.
    for (const papel of ['gestor', 'empresa']) {
      expect(
        podeGerenciarAssinatura(
          profileFake({ role: papel, ownerId: OUTRO_AUTH_ID }),
          sessionFake(AUTH_ID),
        ),
      ).toBe(true);
    }
  });

  it('gestor ainda precisa de sessão — sem ela o servidor não teria como autorizar', () => {
    expect(podeGerenciarAssinatura(profileFake({ role: 'gestor', ownerId: OUTRO_AUTH_ID }), null)).toBe(
      false,
    );
  });

  it('false sem sessão, sem user ou sem id', () => {
    expect(podeGerenciarAssinatura(profileFake(), null)).toBe(false);
    expect(podeGerenciarAssinatura(profileFake(), {})).toBe(false);
    expect(podeGerenciarAssinatura(profileFake(), sessionSemUsuario())).toBe(false);
  });

  it('false sem profile ou sem empresa', () => {
    expect(podeGerenciarAssinatura(null, sessionFake())).toBe(false);
    expect(podeGerenciarAssinatura(profileFake({ semEmpresa: true }), sessionFake())).toBe(false);
  });

  it('false para usuário suspenso', () => {
    expect(podeGerenciarAssinatura(profileFake({ deletedAt: '2026-01-01' }), sessionFake())).toBe(false);
  });

  it('false para admin global que não é dono — a cobrança é sempre de um tenant específico', () => {
    expect(
      podeGerenciarAssinatura(
        profileFake({ role: 'admin', ownerId: OUTRO_AUTH_ID }),
        sessionFake(AUTH_ID),
      ),
    ).toBe(false);
  });

  it('normaliza o papel — "Gestor" com maiúscula continua valendo', () => {
    expect(
      podeGerenciarAssinatura(
        profileFake({ role: 'Gestor', ownerId: OUTRO_AUTH_ID }),
        sessionFake(AUTH_ID),
      ),
    ).toBe(true);
  });

  it('compara ignorando caixa e espaços', () => {
    expect(
      podeGerenciarAssinatura(profileFake({ ownerId: AUTH_ID.toUpperCase() }), sessionFake(AUTH_ID)),
    ).toBe(true);
    expect(podeGerenciarAssinatura(profileFake({ ownerId: ` ${AUTH_ID} ` }), sessionFake(AUTH_ID))).toBe(
      true,
    );
  });

  it('não lança com owner_id ausente', () => {
    const p = profileFake({ role: 'vendedor' });
    delete (p.empresas as Record<string, unknown>).owner_id;
    expect(podeGerenciarAssinatura(p, sessionFake())).toBe(false);
  });
});

describe('trial liberado pelo painel de CS — vale ate a data, nao para sempre', () => {
  const ONTEM = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const AMANHA = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  it('libera enquanto o trial esta no prazo', () => {
    expect(planoBloqueado(profileFake({ planStatus: 'trialing', fimDoPeriodo: AMANHA }))).toBe(false);
  });

  it('BLOQUEIA quando o trial venceu', () => {
    // Sem esta regra, `trialing` nunca entra na denylist e o botao de
    // "liberar 7 dias" viraria acesso vitalicio.
    expect(planoBloqueado(profileFake({ planStatus: 'trialing', fimDoPeriodo: ONTEM }))).toBe(true);
  });

  it('libera trial sem data — espelha empresa_plano_ativo()', () => {
    // O webhook do Stripe ja gravou trial sem current_period_end; trancar por
    // causa de campo vazio custa mais que liberar a mais por alguns dias.
    expect(planoBloqueado(profileFake({ planStatus: 'trialing', fimDoPeriodo: null }))).toBe(false);
    expect(planoBloqueado(profileFake({ planStatus: 'trialing' }))).toBe(false);
  });

  it('data invalida nao bloqueia', () => {
    expect(planoBloqueado(profileFake({ planStatus: 'trialing', fimDoPeriodo: 'nao-e-data' }))).toBe(false);
  });

  it('a data so vale para trial: cortesia vencida segue liberada', () => {
    // 'active' com data no passado e o caso de quem pagou e o Stripe ainda nao
    // confirmou a renovacao. Bloquear ali geraria falso positivo em cliente bom.
    expect(planoBloqueado(profileFake({ planStatus: 'active', fimDoPeriodo: ONTEM }))).toBe(false);
  });

  it('admin com trial vencido continua liberado', () => {
    expect(planoBloqueado(profileFake({ role: 'admin', planStatus: 'trialing', fimDoPeriodo: ONTEM }))).toBe(false);
  });

  it('inactive segue bloqueado, com data ou sem', () => {
    expect(planoBloqueado(profileFake({ planStatus: 'inactive', fimDoPeriodo: AMANHA }))).toBe(true);
  });
});
