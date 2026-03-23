export interface ActorDisplayInput {
  principalType?: string | null;
  userId?: number | null;
  agentId?: string | null;
  profileId?: string | null;
  fallback?: string | null;
}

export interface ActorDisplayOptions {
  profileLabels?: ReadonlyMap<string, string>;
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function shortId(value: string, length = 8): string {
  if (value.length <= length) return value;
  return value.slice(0, length);
}

function profileLabel(profileId: string | null, profileLabels?: ReadonlyMap<string, string>): string | null {
  const normalized = normalizeText(profileId);
  if (!normalized || !profileLabels) return null;
  return normalizeText(profileLabels.get(normalized));
}

function labelFromAgentId(agentId: string, profileLabels?: ReadonlyMap<string, string>): string {
  const profileFromAgent = profileLabel(agentId, profileLabels);
  if (profileFromAgent) return profileFromAgent;

  if (agentId.startsWith('profile-')) return `Agent Profile ${shortId(agentId)}`;
  if (agentId.startsWith('assistant:')) return 'Assistant';
  if (agentId.startsWith('shared-')) return `AI Agent (legacy ${shortId(agentId)})`;
  if (agentId.startsWith('user-')) return `User Bridge ${shortId(agentId)}`;
  return `AI Agent ${shortId(agentId)}`;
}

function parseSourceToken(source: string): Partial<ActorDisplayInput> {
  if (source.startsWith('user:')) {
    const userToken = source.slice('user:'.length).trim();
    const parsed = Number.parseInt(userToken, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return { principalType: 'user', userId: parsed };
    }
  }
  if (source.startsWith('agent:')) {
    const agentToken = source.slice('agent:'.length).trim();
    if (agentToken) {
      return { principalType: 'agent', agentId: agentToken };
    }
  }
  if (source === 'service:bridge') {
    return { principalType: 'service' };
  }
  return {};
}

export function formatActorLabel(
  input: ActorDisplayInput,
  options?: ActorDisplayOptions,
): string {
  const profileLabels = options?.profileLabels;
  const principalType = normalizeText(input.principalType)?.toLowerCase() ?? null;
  const fallback = normalizeText(input.fallback);

  if (principalType === 'user' && input.userId != null) {
    return `User #${input.userId}`;
  }

  const explicitProfileLabel = profileLabel(input.profileId ?? null, profileLabels);
  if (explicitProfileLabel) {
    return explicitProfileLabel;
  }

  const normalizedAgentId = normalizeText(input.agentId);
  if (normalizedAgentId) {
    return labelFromAgentId(normalizedAgentId, profileLabels);
  }

  if (principalType === 'service') {
    return 'Bridge Service';
  }

  if (input.userId != null) {
    return `User #${input.userId}`;
  }

  if (fallback) {
    const parsed = parseSourceToken(fallback);
    if (
      parsed.principalType !== undefined ||
      parsed.userId !== undefined ||
      parsed.agentId !== undefined
    ) {
      return formatActorLabel(
        {
          principalType: parsed.principalType ?? null,
          userId: parsed.userId ?? null,
          agentId: parsed.agentId ?? null,
          fallback: null,
        },
        options,
      );
    }

    const fallbackProfileLabel = profileLabel(fallback, profileLabels);
    if (fallbackProfileLabel) return fallbackProfileLabel;

    if (fallback.startsWith('profile-') || fallback.startsWith('shared-') || fallback.startsWith('user-')) {
      return labelFromAgentId(fallback, profileLabels);
    }
    return fallback;
  }

  return 'Unknown actor';
}

