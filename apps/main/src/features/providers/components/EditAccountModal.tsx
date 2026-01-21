/**
 * EditAccountModal Component
 *
 * Modal form for editing provider account settings including:
 * - Email and nickname
 * - API key / JWT token
 * - OpenAPI key for paid tiers
 * - Google account authentication flag
 */

import { Modal, FormField, Input, Button, useToast } from '@pixsim7/shared.ui';
import { useState, useEffect } from 'react';

import type { ProviderAccount } from '../hooks/useProviderAccounts';
import type { AccountUpdate } from '../lib/api/accounts';
import { connectPixverseWithGoogle, createApiKey } from '../lib/api/accounts';

/** Form state for editing an account */
interface EditAccountFormState {
  email: string;
  nickname: string;
  api_key: string;
  openapi_key: string;
  is_google_account: boolean;
  clearOpenApiKey: boolean;
}

type AccountApiKey = {
  id?: string;
  kind?: string;
  name?: string;
  value?: string;
};

/** Create initial form state from account */
function createInitialFormState(account: ProviderAccount): EditAccountFormState {
  return {
    email: account.email,
    nickname: account.nickname ?? '',
    api_key: '',
    openapi_key: '',
    is_google_account: account.is_google_account,
    clearOpenApiKey: false,
  };
}

/** Build update payload from form state, only including changed fields */
function buildAccountUpdatePayload(
  account: ProviderAccount,
  form: EditAccountFormState
): AccountUpdate {
  const trimmedEmail = form.email.trim();
  const currentNickname = account.nickname ?? '';
  const trimmedApiKey = form.api_key.trim();
  const trimmedOpenApiKey = form.openapi_key.trim();
  const updates: AccountUpdate = {
    ...(trimmedEmail && trimmedEmail !== account.email ? { email: trimmedEmail } : {}),
    ...(form.nickname !== currentNickname ? { nickname: form.nickname } : {}),
    ...(trimmedApiKey ? { api_key: trimmedApiKey } : {}),
    ...(form.clearOpenApiKey
      ? { api_keys: [] }
      : trimmedOpenApiKey
        ? {
          api_keys: [
            { id: 'openapi_main', kind: 'openapi', value: trimmedOpenApiKey, priority: 10 },
          ],
        }
        : {}),
    ...(form.is_google_account !== account.is_google_account
      ? { is_google_account: form.is_google_account }
      : {}),
  };

  return updates;
}

interface EditAccountModalProps {
  account: ProviderAccount;
  onClose: () => void;
  onSave: (accountId: number, data: AccountUpdate) => Promise<void>;
  onRefresh?: () => void;
}

export function EditAccountModal({ account, onClose, onSave, onRefresh }: EditAccountModalProps) {
  const [formState, setFormState] = useState<EditAccountFormState>(() =>
    createInitialFormState(account)
  );
  const [saving, setSaving] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [creatingApiKey, setCreatingApiKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(account.has_api_key_paid);
  const toast = useToast();
  const apiKeys = Array.isArray(account.api_keys) ? (account.api_keys as AccountApiKey[]) : [];

  useEffect(() => {
    setFormState(createInitialFormState(account));
    setHasApiKey(account.has_api_key_paid);
  }, [account]);

  const handleCreateApiKey = async () => {
    if (account.provider_id !== 'pixverse') {
      toast.error('API key creation only supported for Pixverse');
      return;
    }
    if (!account.has_jwt) {
      toast.error('Account needs JWT token to create API key');
      return;
    }

    setCreatingApiKey(true);
    try {
      await createApiKey(account.id);
      toast.success('API key created successfully!');
      setHasApiKey(true);
      // Refresh to show the new key
      onRefresh?.();
      // Close and reopen modal to see updated account
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create API key';
      toast.error(message);
      setCreatingApiKey(false);
    }
  };

  const updateFormField = <K extends keyof EditAccountFormState>(
    field: K,
    value: EditAccountFormState[K]
  ) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleGoogleFlag = async () => {
    setConnectingGoogle(true);
    try {
      await connectPixverseWithGoogle(account.id);
      toast.success('Account flagged as Google-authenticated');
      setFormState((prev) => ({ ...prev, is_google_account: true }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to connect via Google';
      toast.error(message);
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = buildAccountUpdatePayload(account, formState);

      if (Object.keys(updates).length === 0) {
        onClose();
        return;
      }

      await onSave(account.id, updates);
      onClose();
    } catch (error) {
      console.error('Failed to update account:', error);
      alert(`Failed to update account: ${error}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Edit Account" size="lg">
      <div className="space-y-4">
        <FormField label="Email" size="md">
          <Input
            type="email"
            size="md"
            value={formState.email}
            onChange={(e) => updateFormField('email', e.target.value)}
            placeholder="account@example.com"
          />
        </FormField>

        <FormField label="Nickname" optional size="md">
          <Input
            type="text"
            size="md"
            value={formState.nickname}
            onChange={(e) => updateFormField('nickname', e.target.value)}
            placeholder="My Account"
          />
        </FormField>

        <FormField
          label="JWT Token (Session)"
          helpText="Web API session token - leave empty to keep existing"
          size="md"
        >
          <Input
            type="text"
            size="md"
            autoComplete="new-password"
            data-lpignore="true"
            value={formState.api_key}
            onChange={(e) => updateFormField('api_key', e.target.value)}
            placeholder="Paste JWT token from browser session"
            className="font-mono"
          />
          {account.has_jwt && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              ✓ Currently has JWT token
              {account.jwt_expired && <span className="text-red-500 ml-2">⚠ Expired</span>}
            </p>
          )}
        </FormField>

        <FormField
          label="OpenAPI Keys"
          helpText="API keys for direct API access - enables faster status polling"
          size="md"
        >
          <div className="space-y-3">
            {/* Existing keys */}
            {apiKeys.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Existing keys ({apiKeys.length}):
                </div>
                {apiKeys.map((key, idx) => {
                  const displayValue = key.value || '';
                  const maskedValue = displayValue.length > 14
                    ? `${displayValue.slice(0, 10)}...${displayValue.slice(-4)}`
                    : displayValue || '(empty)';
                  return (
                    <div
                      key={key.id || idx}
                      className="flex items-center gap-2 p-2 bg-neutral-100 dark:bg-neutral-800 rounded text-xs font-mono"
                    >
                      <span className="text-green-600 dark:text-green-400">✓</span>
                      <span className="flex-1 truncate" title={displayValue}>
                        {key.name || key.kind || `Key ${idx + 1}`}: {maskedValue}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new key manually */}
            <div>
              <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Add new key manually:
              </div>
              <Input
                type="text"
                size="md"
                autoComplete="new-password"
                data-lpignore="true"
                value={formState.openapi_key}
                onChange={(e) => updateFormField('openapi_key', e.target.value)}
                placeholder="sk-... (paste key here)"
                className="font-mono"
              />
            </div>

            {/* Create key button (Pixverse only) */}
            {account.provider_id === 'pixverse' && account.has_jwt && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleCreateApiKey}
                  disabled={creatingApiKey}
                >
                  {creatingApiKey ? 'Creating...' : 'Create New API Key'}
                </Button>
                <span className="text-xs text-neutral-500">
                  Auto-create from your Pixverse account
                </span>
              </div>
            )}

            {/* Clear all keys option */}
            {hasApiKey && (
              <label className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
                <input
                  type="checkbox"
                  className="rounded border-neutral-300 dark:border-neutral-600"
                  checked={formState.clearOpenApiKey}
                  onChange={(e) => updateFormField('clearOpenApiKey', e.target.checked)}
                />
                <span>Clear all stored API keys on save</span>
              </label>
            )}
          </div>
        </FormField>

        {/* Google Account Marker */}
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-neutral-300 dark:border-neutral-600"
              checked={formState.is_google_account}
              onChange={(e) => updateFormField('is_google_account', e.target.checked)}
            />
            <div>
              <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                Google Account
              </div>
              <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                Mark this account as authenticated via Google Sign-In
              </div>
            </div>
          </label>
          <div className="mt-2 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
            <span>Need backend to detect it?</span>
            <Button
              size="xs"
              variant="ghost"
              onClick={handleGoogleFlag}
              disabled={connectingGoogle}
            >
              {connectingGoogle ? 'Flagging…' : 'Mark via backend'}
            </Button>
          </div>
        </div>

        {/* Account Status Info */}
        <div className="p-3 bg-neutral-100 dark:bg-neutral-700 rounded-lg">
          <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
            <div>
              <strong>Provider:</strong> {account.provider_id}
            </div>
            <div>
              <strong>Status:</strong> {account.status}
            </div>
            {account.has_cookies && <div>✓ Has cookies</div>}
            {account.jwt_expired && <div className="text-red-500">⚠ JWT expired</div>}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </Modal>
  );
}
