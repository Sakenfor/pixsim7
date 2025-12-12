/**
 * EditAccountModal Component
 *
 * Modal form for editing provider account settings including:
 * - Email and nickname
 * - API key / JWT token
 * - OpenAPI key for paid tiers
 * - Google account authentication flag
 */

import { useState, useEffect } from 'react';
import { Modal, FormField, Input, Button, useToast } from '@pixsim7/shared.ui';
import type { ProviderAccount } from '../hooks/useProviderAccounts';
import type { UpdateAccountRequest } from '../lib/api/accounts';
import { connectPixverseWithGoogle } from '../lib/api/accounts';

/** Form state for editing an account */
export interface EditAccountFormState {
  email: string;
  nickname: string;
  api_key: string;
  openapi_key: string;
  is_google_account: boolean;
  clearOpenApiKey: boolean;
}

/** Create initial form state from account */
export function createInitialFormState(account: ProviderAccount): EditAccountFormState {
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
export function buildAccountUpdatePayload(
  account: ProviderAccount,
  form: EditAccountFormState
): UpdateAccountRequest {
  const updates: UpdateAccountRequest = {};

  const trimmedEmail = form.email.trim();
  if (trimmedEmail && trimmedEmail !== account.email) {
    updates.email = trimmedEmail;
  }

  const currentNickname = account.nickname ?? '';
  if (form.nickname !== currentNickname) {
    updates.nickname = form.nickname;
  }

  const trimmedApiKey = form.api_key.trim();
  if (trimmedApiKey) {
    updates.api_key = trimmedApiKey;
  }

  const trimmedOpenApiKey = form.openapi_key.trim();
  if (form.clearOpenApiKey) {
    updates.api_keys = [];
  } else if (trimmedOpenApiKey) {
    updates.api_keys = [
      { id: 'openapi_main', kind: 'openapi', value: trimmedOpenApiKey, priority: 10 },
    ];
  }

  if (form.is_google_account !== account.is_google_account) {
    updates.is_google_account = form.is_google_account;
  }

  return updates;
}

interface EditAccountModalProps {
  account: ProviderAccount;
  onClose: () => void;
  onSave: (accountId: number, data: UpdateAccountRequest) => Promise<void>;
}

export function EditAccountModal({ account, onClose, onSave }: EditAccountModalProps) {
  const [formState, setFormState] = useState<EditAccountFormState>(() =>
    createInitialFormState(account)
  );
  const [saving, setSaving] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setFormState(createInitialFormState(account));
  }, [account]);

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
          label="API Key / JWT Token"
          helpText="Leave empty to keep existing"
          size="md"
        >
          <Input
            type="text"
            size="md"
            autoComplete="off"
            value={formState.api_key}
            onChange={(e) => updateFormField('api_key', e.target.value)}
            placeholder="Enter new API key or JWT token"
            className="font-mono"
          />
          {account.has_jwt && (
            <p className="text-xs text-neutral-500 mt-1">Currently has JWT token</p>
          )}
        </FormField>

        <FormField
          label="OpenAPI Key (Pro/Paid)"
          helpText="For Pixverse: This is the OpenAPI key for paid accounts with higher limits"
          size="md"
        >
          <Input
            type="text"
            size="md"
            autoComplete="off"
            value={formState.openapi_key}
            onChange={(e) => updateFormField('openapi_key', e.target.value)}
            placeholder="Enter OpenAPI key for paid tier"
            className="font-mono"
          />
          {account.has_api_key_paid && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              ✓ Currently has OpenAPI key (Pro tier active)
            </p>
          )}
          {account.has_api_key_paid && (
            <label className="mt-1 flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
              <input
                type="checkbox"
                className="rounded border-neutral-300 dark:border-neutral-600"
                checked={formState.clearOpenApiKey}
                onChange={(e) => updateFormField('clearOpenApiKey', e.target.checked)}
              />
              <span>Clear stored OpenAPI key on save</span>
            </label>
          )}
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
