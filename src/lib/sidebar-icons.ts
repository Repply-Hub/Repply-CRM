import {
  LayoutDashboard, Kanban, Users, FileText, Settings, HardHat, Factory,
  Globe, CalendarDays, ClipboardList, Link, BarChart3, Mail, Phone,
  Star, Heart, BookOpen, Briefcase, Home, Map, Package, ShoppingCart,
  Truck, Wallet, Wrench, Zap, MessageCircle, List, FileWarning, type LucideIcon
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Kanban,
  List,
  Users,
  FileText,
  Settings,
  HardHat,
  Factory,
  Globe,
  CalendarDays,
  ClipboardList,
  Link,
  BarChart3,
  Mail,
  Phone,
  Star,
  Heart,
  BookOpen,
  Briefcase,
  Home,
  Map,
  Package,
  ShoppingCart,
  Truck,
  Wallet,
  Wrench,
  Zap,
  MessageCircle,
};

export const AVAILABLE_ICONS = Object.keys(ICON_MAP);

export function getIconComponent(name: string): LucideIcon | undefined {
  return ICON_MAP[name];
}
