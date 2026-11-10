'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Bot,
  CornerDownLeft,
  FileText,
  GitBranch,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  Network,
  Plus,
  PlugZap,
  Radio,
  Search,
  Settings,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { openOrganizationModal } from '@/lib/organization-modal';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  SETTINGS_SECTIONS,
  SECTION_META,
} from '@/components/settings/settings-sections';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  onSelect?: () => void;
  icon: LucideIcon;
}

interface CommandGroup {
  id: string;
  label: string;
  items: CommandItem[];
}

interface ContactHit {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
}

interface RelatedContact {
  name: string | null;
  phone?: string | null;
}

interface ConversationHit {
  id: string;
  last_message_text: string | null;
  contact: RelatedContact | RelatedContact[] | null;
}

interface DealHit {
  id: string;
  title: string;
  value: number | null;
  currency: string | null;
  status: string | null;
  contact: RelatedContact | RelatedContact[] | null;
}

interface TemplateHit {
  id: string;
  name: string;
  language: string | null;
  status: string | null;
}

interface SearchResults {
  contacts: ContactHit[];
  conversations: ConversationHit[];
  deals: DealHit[];
  templates: TemplateHit[];
}

const EMPTY_RESULTS: SearchResults = {
  contacts: [],
  conversations: [],
  deals: [],
  templates: [],
};

const NAV_ITEMS: { labelKey: string; href: string; icon: LucideIcon }[] = [
  { labelKey: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  { labelKey: 'inbox', href: '/inbox', icon: MessageSquare },
  { labelKey: 'contacts', href: '/contacts', icon: Users },
  { labelKey: 'pipelines', href: '/pipelines', icon: GitBranch },
  { labelKey: 'broadcasts', href: '/broadcasts', icon: Radio },
  { labelKey: 'automations', href: '/automations', icon: Zap },
  { labelKey: 'flows', href: '/flows', icon: Workflow },
  { labelKey: 'aiAgents', href: '/agents', icon: Bot },
];

const QUICK_ACTIONS: {
  labelKey: string;
  href: string;
  icon: LucideIcon;
}[] = [
  { labelKey: 'openInbox', href: '/inbox', icon: MessageSquare },
  { labelKey: 'newContact', href: '/contacts?new=1', icon: Plus },
  { labelKey: 'newBroadcast', href: '/broadcasts/new', icon: Radio },
  { labelKey: 'newAutomation', href: '/automations/new', icon: Zap },
  { labelKey: 'newTemplate', href: '/settings?tab=templates', icon: FileText },
  { labelKey: 'openWhatsapp', href: '/settings?tab=channels', icon: PlugZap },
  { labelKey: 'openSettings', href: '/settings', icon: Settings },
];

function sanitizeTerm(query: string): string {
  // Keep the PostgREST `or=` expression valid. These characters are
  // reserved by the filter grammar and have no place in a search box.
  return query
    .replace(/[,()%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesQuery(
  value: string | null | undefined,
  query: string
): boolean {
  return !!value && value.toLocaleLowerCase().includes(query);
}

/**
 * PostgREST returns a to-one embedding as an object, but Supabase's
 * generated TS types model it as an array. Normalise both shapes so the
 * palette doesn't depend on which one the client returns at runtime.
 */
function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function GlobalSearch() {
  const router = useRouter();
  const { accountId } = useAuth();
  const t = useTranslations('CommandPalette');
  const tHeader = useTranslations('Header');
  const tNav = useTranslations('Sidebar');
  const tSettings = useTranslations('Settings.sections');

  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  // The header field owns the trigger; Cmd/Ctrl+K just opens it.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLocaleLowerCase() === 'k'
      ) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const safe = sanitizeTerm(q);
      if (!safe) {
        setResults(EMPTY_RESULTS);
        setLoading(false);
        return;
      }
      setLoading(true);
      const term = `%${safe}%`;

      const [contactsRes, conversationsRes, dealsRes, templatesRes] =
        await Promise.all([
          supabase
            .from('contacts')
            .select('id,name,phone,email,company')
            .or(
              `name.ilike.${term},phone.ilike.${term},email.ilike.${term},company.ilike.${term}`
            )
            .limit(6),
          supabase
            .from('conversations')
            .select('id,last_message_text,contact:contacts(name,phone)')
            .order('last_message_at', { ascending: false })
            .limit(150),
          supabase
            .from('deals')
            .select('id,title,value,currency,status,contact:contacts(name)')
            .ilike('title', term)
            .limit(6),
          supabase
            .from('message_templates')
            .select('id,name,language,status')
            .ilike('name', term)
            .limit(6),
        ]);

      if (cancelled) return;

      const lower = q.toLocaleLowerCase();
      const conversations = ((conversationsRes.data ?? []) as ConversationHit[])
        .filter((conversation) => {
          const contact = firstRelated(conversation.contact);
          return (
            includesQuery(contact?.name, lower) ||
            includesQuery(contact?.phone, lower) ||
            includesQuery(conversation.last_message_text, lower)
          );
        })
        .slice(0, 6);

      setResults({
        contacts: (contactsRes.data ?? []) as ContactHit[],
        conversations,
        deals: (dealsRes.data ?? []) as DealHit[],
        templates: (templatesRes.data ?? []) as TemplateHit[],
      });
      setActiveIndex(0);
      setLoading(false);
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, supabase, accountId]);

  const groups = useMemo<CommandGroup[]>(() => {
    const q = query.trim().toLocaleLowerCase();
    const matches = (value: string | null | undefined) =>
      !q || includesQuery(value, q);

    const actionItems: CommandItem[] = [
      ...(matches(tHeader('structure'))
        ? [
            {
              id: 'action:organization',
              title: tHeader('structure'),
              subtitle: t('subtitles.action'),
              onSelect: openOrganizationModal,
              icon: Network,
            } satisfies CommandItem,
          ]
        : []),
      ...QUICK_ACTIONS.filter((action) =>
        matches(t(`actions.${action.labelKey}`))
      ).map((action) => ({
        id: `action:${action.labelKey}`,
        title: t(`actions.${action.labelKey}`),
        subtitle: t('subtitles.action'),
        href: action.href,
        icon: action.icon,
      })),
    ];

    const navItems: CommandItem[] = NAV_ITEMS.filter((item) =>
      matches(tNav(item.labelKey))
    ).map((item) => ({
      id: `nav:${item.href}`,
      title: tNav(item.labelKey),
      href: item.href,
      icon: item.icon,
    }));

    const settingItems: CommandItem[] = q
      ? SETTINGS_SECTIONS.filter((section) => matches(tSettings(section))).map(
          (section) => ({
            id: `setting:${section}`,
            title: tSettings(section),
            subtitle: t('subtitles.setting'),
            href: `/settings?tab=${section}`,
            icon: SECTION_META[section].icon,
          })
        )
      : [];

    const conversationItems: CommandItem[] = results.conversations.map(
      (conversation) => {
        const contact = firstRelated(conversation.contact);
        const name =
          contact?.name || contact?.phone || t('groups.conversations');
        return {
          id: `conversation:${conversation.id}`,
          title: name,
          subtitle: contact?.phone
            ? contact.phone
            : conversation.last_message_text || undefined,
          href: `/inbox?c=${conversation.id}`,
          icon: MessageSquare,
        };
      }
    );

    const contactItems: CommandItem[] = results.contacts.map((contact) => ({
      id: `contact:${contact.id}`,
      title: contact.name || contact.phone || t('subtitles.contact'),
      subtitle:
        [contact.phone, contact.email, contact.company]
          .filter(Boolean)
          .join(' · ') || t('subtitles.contact'),
      href: `/contacts?contact=${contact.id}`,
      icon: Users,
    }));

    const dealItems: CommandItem[] = results.deals.map((deal) => {
      const contact = firstRelated(deal.contact);
      return {
        id: `deal:${deal.id}`,
        title: deal.title,
        subtitle:
          [
            deal.value != null
              ? `${deal.value}${deal.currency ? ` ${deal.currency}` : ''}`
              : null,
            deal.status,
            contact?.name,
          ]
            .filter(Boolean)
            .join(' · ') || t('subtitles.deal'),
        href: '/pipelines',
        icon: GitBranch,
      };
    });

    const templateItems: CommandItem[] = results.templates.map((template) => ({
      id: `template:${template.id}`,
      title: template.name,
      subtitle:
        [template.language, template.status].filter(Boolean).join(' · ') ||
        t('subtitles.template'),
      href: '/settings?tab=templates',
      icon: FileText,
    }));

    return [
      { id: 'actions', label: t('groups.actions'), items: actionItems },
      {
        id: 'conversations',
        label: t('groups.conversations'),
        items: conversationItems,
      },
      { id: 'contacts', label: t('groups.contacts'), items: contactItems },
      { id: 'deals', label: t('groups.deals'), items: dealItems },
      { id: 'templates', label: t('groups.templates'), items: templateItems },
      { id: 'navigation', label: t('groups.navigation'), items: navItems },
      { id: 'settings', label: t('groups.settings'), items: settingItems },
    ].filter((group) => group.items.length > 0);
  }, [query, results, t, tHeader, tNav, tSettings]);

  const flatItems = useMemo(
    () => groups.flatMap((group) => group.items),
    [groups]
  );

  // Clamp in render instead of an effect: when the result set shrinks,
  // the old index would otherwise point past the end for one frame.
  const safeActiveIndex =
    flatItems.length === 0 ? 0 : Math.min(activeIndex, flatItems.length - 1);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [safeActiveIndex]);

  const selectItem = useCallback(
    (item: CommandItem | undefined) => {
      if (!item) return;
      setOpen(false);
      setQuery('');
      if (item.onSelect) {
        item.onSelect();
        return;
      }
      if (item.href) router.push(item.href);
    },
    [router]
  );

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) =>
        flatItems.length === 0 ? 0 : (index + 1) % flatItems.length
      );
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) =>
        flatItems.length === 0
          ? 0
          : (index - 1 + flatItems.length) % flatItems.length
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectItem(flatItems[safeActiveIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  let itemIndex = -1;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery('');
          setResults(EMPTY_RESULTS);
          setLoading(false);
        }
      }}
    >
      <PopoverTrigger
        aria-label={tHeader('search')}
        className="border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground data-popup-open:bg-muted inline-flex h-10 w-10 cursor-pointer items-center justify-center gap-2 rounded-lg border px-0 text-sm transition-colors md:w-[240px] md:justify-start md:px-3 lg:w-[320px] xl:w-[360px]"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden truncate md:inline">{tHeader('search')}</span>
        <kbd className="border-border bg-muted ml-auto hidden shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium md:inline">
          ⌘K
        </kbd>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[min(92vw,560px)] gap-0 overflow-hidden p-0"
      >
        <div className="border-border flex items-center gap-2 border-b px-3">
          <Search className="text-muted-foreground h-4 w-4 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              setActiveIndex(0);
              if (next.trim().length < 2) {
                setResults(EMPTY_RESULTS);
                setLoading(false);
              }
            }}
            onKeyDown={onInputKeyDown}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            role="combobox"
            aria-expanded
            aria-controls="command-palette-results"
            aria-activedescendant={
              flatItems[safeActiveIndex]
                ? `command-item-${flatItems[safeActiveIndex].id}`
                : undefined
            }
            className="text-foreground placeholder:text-muted-foreground h-12 w-full bg-transparent text-sm outline-none"
          />
          {loading && (
            <Loader2 className="text-muted-foreground h-4 w-4 shrink-0 animate-spin" />
          )}
          <kbd className="border-border bg-muted text-muted-foreground hidden shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium sm:inline">
            Esc
          </kbd>
        </div>

        <div
          id="command-palette-results"
          role="listbox"
          className="max-h-[min(60vh,420px)] overflow-y-auto p-2"
        >
          {groups.length === 0 ? (
            <div className="text-muted-foreground px-3 py-8 text-center text-sm">
              {loading ? t('loading') : t('noResults', { query: query.trim() })}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="mb-1 last:mb-0">
                <p className="text-muted-foreground px-2 py-1.5 text-[10px] font-semibold tracking-wider uppercase">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  itemIndex += 1;
                  const index = itemIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      id={`command-item-${item.id}`}
                      ref={
                        index === safeActiveIndex ? activeItemRef : undefined
                      }
                      type="button"
                      role="option"
                      aria-selected={index === safeActiveIndex}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectItem(item)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                        index === safeActiveIndex
                          ? 'bg-primary/10 text-foreground'
                          : 'text-foreground hover:bg-muted/60'
                      )}
                    >
                      <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {item.title}
                        </span>
                        {item.subtitle && (
                          <span className="text-muted-foreground block truncate text-xs">
                            {item.subtitle}
                          </span>
                        )}
                      </span>
                      {index === safeActiveIndex && (
                        <CornerDownLeft className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="border-border text-muted-foreground flex items-center gap-3 border-t px-3 py-2 text-[10px]">
          <span className="inline-flex items-center gap-1">
            <kbd className="border-border bg-muted rounded border px-1 py-0.5">
              ↑
            </kbd>
            <kbd className="border-border bg-muted rounded border px-1 py-0.5">
              ↓
            </kbd>
            {t('hints.navigate')}
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="border-border bg-muted rounded border px-1 py-0.5">
              ↵
            </kbd>
            {t('hints.select')}
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <kbd className="border-border bg-muted rounded border px-1 py-0.5">
              Esc
            </kbd>
            {t('hints.close')}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
