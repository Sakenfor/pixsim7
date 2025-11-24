import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { moduleRegistry, PAGE_CATEGORIES, type PageCategory } from '../modules';
import { Button, Panel, ThemeToggle } from '@pixsim7/shared.ui';
import { Icon } from '../lib/icons';
import { usePageTracking } from '../hooks/usePageTracking';

/**
 * Category display configuration
 * Maps PAGE_CATEGORIES to display properties for the homepage
 */
const CATEGORY_LABELS: Record<PageCategory, { label: string; icon: string; color: string }> = {
  [PAGE_CATEGORIES.creation]: { label: '🎨 Content Creation', icon: 'palette', color: 'text-blue-500' },
  [PAGE_CATEGORIES.automation]: { label: '🤖 Automation & AI', icon: 'bot', color: 'text-purple-500' },
  [PAGE_CATEGORIES.game]: { label: '🎮 Game & World', icon: 'play', color: 'text-green-500' },
  [PAGE_CATEGORIES.management]: { label: '⚙️ Management', icon: 'settings', color: 'text-orange-500' },
  [PAGE_CATEGORIES.development]: { label: '🔧 Development', icon: 'code', color: 'text-gray-500' },
};

interface PageCardProps {
  id: string;
  name: string;
  route: string;
  icon: string;
  iconColor?: string;
  description: string;
  isReady?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onClick?: () => void;
}

function PageCard(props: PageCardProps) {
  const {
    name,
    route,
    icon,
    iconColor,
    description,
    isReady = true,
    isFavorite = false,
    onToggleFavorite,
    onClick,
  } = props;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      window.open(route, '_self');
    }
  };

  return (
    <Panel className="space-y-2 hover:shadow-lg transition-shadow relative group">
      {/* Favorite button */}
      {onToggleFavorite && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Icon
            name={isFavorite ? 'star' : 'star'}
            size={16}
            className={isFavorite ? 'text-yellow-500' : 'text-gray-400'}
          />
        </button>
      )}

      <h3 className="font-medium flex items-center gap-2">
        <Icon name={icon} size={18} className={iconColor} />
        {name}
        {!isReady && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
            WIP
          </span>
        )}
      </h3>
      <p className="text-xs text-neutral-500">{description}</p>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="primary" onClick={handleClick}>
          Open
        </Button>
      </div>
    </Panel>
  );
}

export function Home() {
  const { user, logout } = useAuthStore();
  const { favorites, recentPages, toggleFavorite, isFavorite, addToRecent } = usePageTracking({
    userId: user?.username,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [registryVersion, setRegistryVersion] = useState(0);

  // Subscribe to module registry changes
  useEffect(() => {
    const unsubscribe = moduleRegistry.subscribe(() => {
      // Increment version to trigger recomputation
      setRegistryVersion(v => v + 1);
    });

    return () => unsubscribe();
  }, []);

  // Get all pages from module registry - recompute when registry changes
  const allPages = useMemo(
    () => moduleRegistry.getPages({ includeHidden: false }),
    [registryVersion]
  );
  const featuredPages = useMemo(
    () => moduleRegistry.getPages({ featured: true }),
    [registryVersion]
  );
  const pagesByCategory = useMemo(
    () => moduleRegistry.getPagesByCategory(),
    [registryVersion]
  );

  // Filter pages by search query
  const filteredPages = useMemo(() => {
    let pages = allPages;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      pages = pages.filter(
        page =>
          page.name.toLowerCase().includes(query) ||
          page.description.toLowerCase().includes(query)
      );
    }

    // Filter by category
    if (selectedCategory) {
      pages = pages.filter(page => page.category === selectedCategory);
    }

    return pages;
  }, [allPages, searchQuery, selectedCategory]);

  // Group filtered pages by category
  const filteredByCategory = useMemo(() => {
    const grouped: Record<string, typeof allPages> = {};
    for (const page of filteredPages) {
      if (!grouped[page.category]) {
        grouped[page.category] = [];
      }
      grouped[page.category].push(page);
    }
    return grouped;
  }, [filteredPages]);

  // Get favorite pages
  const favoritePages = useMemo(() => {
    return allPages.filter(page => favorites.includes(page.id));
  }, [allPages, favorites]);

  /**
   * Centralized navigation helper
   * Ensures all navigation updates recent pages consistently
   */
  const navigateToPage = useCallback((page: { id: string; name: string; route: string; icon: string; iconColor?: string }) => {
    addToRecent({
      id: page.id,
      name: page.name,
      route: page.route,
      icon: page.icon,
      iconColor: page.iconColor,
    });
    window.open(page.route, '_self');
  }, [addToRecent]);

  /**
   * Navigate to a page by route
   * Looks up the page in the registry and uses centralized navigation
   */
  const navigateToRoute = useCallback((route: string) => {
    const page = allPages.find(p => p.route === route);
    if (page) {
      navigateToPage(page);
    } else {
      // Fallback for routes not in registry
      window.open(route, '_self');
    }
  }, [allPages, navigateToPage]);

  const categories = Object.keys(CATEGORY_LABELS);

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-8 content-with-dock min-h-screen">
      {/* Header */}
      <header className="border-b border-neutral-200 dark:border-neutral-800 pb-6 flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">PixSim7 - Interactive Video Platform</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Welcome, {user?.username}! Explore tools for content creation, automation, and game development.
          </p>
        </div>
        <div className="flex gap-2">
          <ThemeToggle />
          <Button variant="secondary" onClick={logout}>
            Logout
          </Button>
        </div>
      </header>

      {/* Quick Actions */}
      <section className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => navigateToRoute('/workspace')}>
          <Icon name="palette" size={14} /> Workspace
        </Button>
        <Button size="sm" variant="primary" onClick={() => navigateToRoute('/assets')}>
          <Icon name="image" size={14} /> Gallery
        </Button>
        <Button size="sm" variant="secondary" onClick={() => navigateToRoute('/automation')}>
          <Icon name="bot" size={14} /> Automation
        </Button>
        <Button size="sm" variant="secondary" onClick={() => navigateToRoute('/game-world')}>
          <Icon name="map" size={14} /> Game World
        </Button>
      </section>

      {/* Recent Pages */}
      {recentPages.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Icon name="clock" size={18} />
              Recent Pages
            </h2>
          </div>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {recentPages.map(page => (
              <PageCard
                key={page.id}
                {...page}
                isReady={true}
                isFavorite={isFavorite(page.id)}
                onToggleFavorite={() => toggleFavorite(page.id)}
                onClick={() => navigateToPage(page)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Favorites */}
      {favoritePages.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="star" size={18} className="text-yellow-500" />
            Favorites
          </h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {favoritePages.map(page => (
              <PageCard
                key={page.id}
                {...page}
                isFavorite={true}
                onToggleFavorite={() => toggleFavorite(page.id)}
                onClick={() => navigateToPage(page)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Search and Filter */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Icon
              name="search"
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="text"
              placeholder="Search pages..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant={selectedCategory === null ? 'primary' : 'secondary'}
              onClick={() => setSelectedCategory(null)}
            >
              All
            </Button>
            {categories.map(category => (
              <Button
                key={category}
                size="sm"
                variant={selectedCategory === category ? 'primary' : 'secondary'}
                onClick={() => setSelectedCategory(category)}
              >
                {CATEGORY_LABELS[category].label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* All Pages by Category */}
      <section className="space-y-6">
        {Object.entries(filteredByCategory).map(([category, pages]) => {
          const categoryInfo = CATEGORY_LABELS[category];
          if (!categoryInfo || pages.length === 0) return null;

          return (
            <div key={category} className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Icon name={categoryInfo.icon} size={18} className={categoryInfo.color} />
                {categoryInfo.label}
              </h2>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {pages.map(page => (
                  <PageCard
                    key={page.id}
                    {...page}
                    isFavorite={isFavorite(page.id)}
                    onToggleFavorite={() => toggleFavorite(page.id)}
                    onClick={() => navigateToPage(page)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* No results */}
      {filteredPages.length === 0 && (
        <div className="text-center py-12 text-neutral-500">
          <Icon name="search" size={48} className="mx-auto mb-4 opacity-20" />
          <p>No pages found matching your search.</p>
        </div>
      )}
    </div>
  );
}
