/**
 * AccountInfoModal Component
 *
 * Modal displaying account details and invited users list for Pixverse accounts.
 */

import { Modal } from '@pixsim7/shared.ui';
import { useState, useEffect } from 'react';

import type { AccountStatsResponse } from '../lib/api/accounts';
import { getAccountStats, getInvitedAccounts } from '../lib/api/accounts';

interface AccountInfoModalProps {
  accountId: number;
  accountEmail: string;
  onClose: () => void;
}

interface InvitedAccount {
  account_id: number;
  account_avatar: string;
  nick_name: string;
  user_name: string;
  register_at: string;
  followed: boolean;
}

export function AccountInfoModal({ accountId, accountEmail, onClose }: AccountInfoModalProps) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AccountStatsResponse | null>(null);
  const [invitedAccounts, setInvitedAccounts] = useState<InvitedAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [statsData, invitedData] = await Promise.all([
          getAccountStats(accountId),
          getInvitedAccounts(accountId),
        ]);
        setStats(statsData);
        const mappedInvites = invitedData.items.map((item) => {
          const record = item as Record<string, unknown>;
          const accountIdValue =
            typeof record.account_id === 'number' ? record.account_id : Number(record.account_id ?? 0);
          return {
            account_id: Number.isFinite(accountIdValue) ? accountIdValue : 0,
            account_avatar: typeof record.account_avatar === 'string' ? record.account_avatar : '',
            nick_name: typeof record.nick_name === 'string' ? record.nick_name : '',
            user_name: typeof record.user_name === 'string' ? record.user_name : '',
            register_at: typeof record.register_at === 'string' ? record.register_at : '',
            followed: Boolean(record.followed),
          };
        });
        setInvitedAccounts(mappedInvites);
      } catch (err) {
        console.error('Failed to load account info:', err);
        setError(err instanceof Error ? err.message : 'Failed to load account information');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [accountId]);

  return (
    <Modal isOpen onClose={onClose} title={`Account Info: ${accountEmail}`}>
      <div className="space-y-4">
        {loading && (
          <div className="text-center py-8 text-neutral-500">Loading...</div>
        )}

        {error && (
          <div className="text-center py-8 text-red-500">
            Error: {error}
          </div>
        )}

        {!loading && !error && stats && (
          <>
            {/* User Info Section */}
            <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                User Information
              </h3>
              {(() => {
                const userInfo = stats.user_info as Record<string, unknown>;
                const username = typeof userInfo.username === 'string' ? userInfo.username : 'N/A';
                const nickname = typeof userInfo.nickname === 'string' ? userInfo.nickname : 'N/A';
                const email = typeof userInfo.email === 'string' ? userInfo.email : accountEmail;
                const inviteCode = typeof userInfo.invite_code === 'string' ? userInfo.invite_code : 'N/A';

                return (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-neutral-500">Username:</span>
                      <span className="ml-2 font-medium text-neutral-800 dark:text-neutral-200">
                        {username}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Nickname:</span>
                      <span className="ml-2 font-medium text-neutral-800 dark:text-neutral-200">
                        {nickname}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Email:</span>
                      <span className="ml-2 font-medium text-neutral-800 dark:text-neutral-200">
                        {email}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Invite Code:</span>
                      <span className="ml-2 font-mono text-xs bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded">
                        {inviteCode}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Invited Accounts Section */}
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                Invited Users ({stats.invited_count})
              </h3>

              {invitedAccounts.length === 0 ? (
                <div className="text-center py-8 text-neutral-500">
                  No invited users yet
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {invitedAccounts.map((invitedUser) => (
                    <div
                      key={invitedUser.account_id}
                      className="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                      {/* Avatar */}
                      <img
                        src={invitedUser.account_avatar}
                        alt={invitedUser.nick_name}
                        className="w-10 h-10 rounded-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"%3E%3Ccircle cx="12" cy="12" r="10" fill="%23e5e7eb"/%3E%3Cpath d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="%239ca3af"/%3E%3C/svg%3E';
                        }}
                      />

                      {/* User Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-neutral-800 dark:text-neutral-200 truncate">
                          {invitedUser.nick_name}
                        </div>
                        <div className="text-xs text-neutral-500 truncate">
                          @{invitedUser.user_name}
                        </div>
                      </div>

                      {/* Registration Date */}
                      <div className="text-xs text-neutral-500">
                        {new Date(invitedUser.register_at).toLocaleDateString()}
                      </div>

                      {/* Followed Badge */}
                      {invitedUser.followed && (
                        <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded">
                          Following
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
