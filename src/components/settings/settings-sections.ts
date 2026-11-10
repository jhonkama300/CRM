import {
  Clock,
  Coins,
  FileText,
  GitBranch,
  HeartPulse,
  Inbox,
  KeyRound,
  LayoutGrid,
  MessageCircle,
  ScrollText,
  Tags,
  UsersRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Settings information architecture for the redesigned page.
 *
 * The flat tab strip became a grouped left rail with a new Overview
 * landing. The URL query param stays `?tab=` (deep-linkable) and maps
 * old values onto the new sections. Personal account panels (profile,
 * security, appearance) live in the account dialog opened from the
 * profile menu, not here.
 */
export const SETTINGS_SECTIONS = [
  'overview',
  'channels',
  'templates',
  'quick-replies',
  'inbox',
  'fields',
  'pipelines',
  'worktime',
  'deals',
  'members',
  'health',
  'audit',
  'api',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = 'overview';

/** Rail grouping. */
export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group: 'top' | 'workspace';
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: {
    id: 'overview',
    label: 'Overview',
    icon: LayoutGrid,
    group: 'top',
  },
  channels: {
    id: 'channels',
    label: 'Channels',
    icon: MessageCircle,
    group: 'workspace',
  },
  templates: {
    id: 'templates',
    label: 'Templates',
    icon: FileText,
    group: 'workspace',
  },
  'quick-replies': {
    id: 'quick-replies',
    label: 'Quick replies',
    icon: Zap,
    group: 'workspace',
  },
  inbox: { id: 'inbox', label: 'Inbox', icon: Inbox, group: 'workspace' },
  fields: {
    id: 'fields',
    label: 'Fields & tags',
    icon: Tags,
    group: 'workspace',
  },
  pipelines: {
    id: 'pipelines',
    label: 'Pipelines',
    icon: GitBranch,
    group: 'workspace',
  },
  worktime: {
    id: 'worktime',
    label: 'Work time',
    icon: Clock,
    group: 'workspace',
  },
  deals: {
    id: 'deals',
    label: 'Deals & currency',
    icon: Coins,
    group: 'workspace',
  },
  members: {
    id: 'members',
    label: 'Team members',
    icon: UsersRound,
    group: 'workspace',
  },
  health: {
    id: 'health',
    label: 'Health',
    icon: HeartPulse,
    group: 'workspace',
  },
  audit: {
    id: 'audit',
    label: 'Audit log',
    icon: ScrollText,
    group: 'workspace',
  },
  api: { id: 'api', label: 'API keys', icon: KeyRound, group: 'workspace' },
};

export const RAIL_GROUPS: {
  label: string | null;
  group: SectionMeta['group'];
}[] = [
  { label: null, group: 'top' },
  { label: 'Workspace', group: 'workspace' },
];

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?tab=` value to a section. Legacy tabs from the old
 * flat layout collapse onto their new home (Tags + Custom fields → the
 * merged "Fields & tags" section). Anything unknown falls back to the
 * Overview landing.
 */
export function resolveSection(raw: string | null): SettingsSection {
  if (raw === 'tags' || raw === 'custom-fields') return 'fields';
  // The single-number WhatsApp tab was replaced by per-channel setup.
  if (raw === 'whatsapp') return 'channels';
  // Personal account tabs moved into the account dialog. Old bookmarks
  // land on the workspace overview instead of a blank panel.
  if (raw === 'profile' || raw === 'security' || raw === 'appearance') {
    return DEFAULT_SECTION;
  }
  if (isSection(raw)) return raw;
  return DEFAULT_SECTION;
}
