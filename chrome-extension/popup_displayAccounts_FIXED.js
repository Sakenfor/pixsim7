// REPLACE the displayAccounts function in popup.js (around line 368) with this:

function displayAccounts(accounts) {
  const accountsList = document.getElementById('accountsList');
  const accountCount = document.getElementById('accountCount');

  accountCount.textContent = `(${accounts.length})`;
  accountsList.innerHTML = '';

  if (accounts.length === 0) {
    accountsList.innerHTML = `
      <div class="info-box">
        No accounts found${currentProvider ? ` for ${currentProvider.name}` : ''}.
        Add accounts via the PixSim7 backend.
      </div>
    `;
    return;
  }

  const sortControls = document.createElement('div');
  sortControls.className = 'sort-controls';
  sortControls.innerHTML = `
    <span style="font-size: 9px; color: #6b7280; margin-right: 4px;">Sort:</span>
    <button class="sort-btn ${accountsSortBy === 'lastUsed' ? 'active' : ''}" data-sort="lastUsed">
      Last ${accountsSortBy === 'lastUsed' ? (accountsSortDesc ? '↓' : '↑') : ''}
    </button>
    <button class="sort-btn ${accountsSortBy === 'name' ? 'active' : ''}" data-sort="name">
      Name ${accountsSortBy === 'name' ? (accountsSortDesc ? '↓' : '↑') : ''}
    </button>
    <button class="sort-btn ${accountsSortBy === 'credits' ? 'active' : ''}" data-sort="credits">
      Credits ${accountsSortBy === 'credits' ? (accountsSortDesc ? '↓' : '↑') : ''}
    </button>
    <button class="sort-btn ${accountsSortBy === 'success' ? 'active' : ''}" data-sort="success">
      Success ${accountsSortBy === 'success' ? (accountsSortDesc ? '↓' : '↑') : ''}
    </button>
  `;

  sortControls.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sortKey = btn.getAttribute('data-sort');
      if (accountsSortBy === sortKey) {
        accountsSortDesc = !accountsSortDesc;
      } else {
        accountsSortBy = sortKey;
        accountsSortDesc = true;
      }
      displayAccounts(accounts);
    });
  });

  accountsList.appendChild(sortControls);

  const sorted = [...accounts].sort((a, b) => {
    let cmp = 0;
    switch (accountsSortBy) {
      case 'name':
        cmp = (a.nickname || a.email).localeCompare(b.nickname || b.email);
        break;
      case 'credits':
        cmp = (a.total_credits || 0) - (b.total_credits || 0);
        break;
      case 'lastUsed':
        const aTime = a.last_used ? new Date(a.last_used).getTime() : 0;
        const bTime = b.last_used ? new Date(b.last_used).getTime() : 0;
        cmp = aTime - bTime;
        break;
      case 'success':
        cmp = (a.success_rate || 0) - (b.success_rate || 0);
        break;
    }
    return accountsSortDesc ? -cmp : cmp;
  });

  sorted.forEach(account => {
    const card = createAccountCard(account);
    accountsList.appendChild(card);
  });
}
