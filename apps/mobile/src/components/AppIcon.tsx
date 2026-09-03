import type { ComponentType } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Baby,
  Bell,
  Book,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  Clipboard,
  Compass,
  Copy,
  Crown,
  Eye,
  FileText,
  Globe,
  Hand,
  Headphones,
  Heart,
  Home,
  Image,
  LayoutTemplate,
  Lock,
  LogOut,
  Mic,
  Moon,
  Music,
  Package,
  Palette,
  Pause,
  Pencil,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  Share2,
  Sparkles,
  Store,
  Ticket,
  Timer,
  Trash2,
  Upload,
  User,
  Volume2,
  X,
  type LucideProps,
} from 'lucide-react-native';
import { colors } from '@masalim/ui';

/**
 * The single icon family (design Foundations): 24-grid, 1.8pt stroke, round
 * caps/joins, currentColor. Emoji stay decorative (themes, avatars); every
 * ACTION icon renders through here so the app reads as one system.
 */
const ICONS = {
  home: Home,
  story: BookOpen,
  book: Book,
  create: Plus,
  child: Baby,
  user: User,
  play: Play,
  pause: Pause,
  back: ArrowLeft,
  close: X,
  settings: Settings,
  mic: Mic,
  sleep: Moon,
  sparkle: Sparkles,
  favorite: Heart,
  share: Share2,
  edit: Pencil,
  search: Search,
  timer: Timer,
  check: Check,
  delete: Trash2,
  retry: RefreshCw,
  bell: Bell,
  lock: Lock,
  order: Package,
  image: Image,
  alert: AlertTriangle,
  audio: Headphones,
  upload: Upload,
  show: Eye,
  chevron: ChevronRight,
  globe: Globe,
  logout: LogOut,
  file: FileText,
  terms: Clipboard,
  robot: Bot,
  compass: Compass,
  crown: Crown,
  ticket: Ticket,
  copy: Copy,
  layout: LayoutTemplate,
  printer: Printer,
  volume: Volume2,
  hand: Hand,
  music: Music,
  palette: Palette,
  store: Store,
} satisfies Record<string, ComponentType<LucideProps>>;

export type AppIconName = keyof typeof ICONS;

interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
  /** Filled variant (favorite/heart, play) — fill follows the stroke color. */
  filled?: boolean;
  strokeWidth?: number;
}

export function AppIcon({
  name,
  size = 20,
  color = colors.foreground,
  filled = false,
  strokeWidth = 1.8,
}: AppIconProps) {
  const Icon = ICONS[name];
  return (
    <Icon
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      fill={filled ? color : 'none'}
      absoluteStrokeWidth
    />
  );
}
