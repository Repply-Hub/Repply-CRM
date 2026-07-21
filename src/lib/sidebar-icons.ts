import {
  LayoutDashboard, Kanban, Users, FileText, Settings, HardHat, Factory,
  Globe, CalendarDays, ClipboardList, Link, BarChart3, Mail, Phone,
  Star, Heart, BookOpen, Briefcase, Home, Map, Package, ShoppingCart,
  Truck, Wallet, Wrench, Zap, MessageCircle, MessageSquare, List, FileWarning,
  Smartphone, Building2, type LucideIcon
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
  MessageSquare,
  FileWarning,
  Smartphone,
  Building2,
};

export const AVAILABLE_ICONS = Object.keys(ICON_MAP);

export function getIconComponent(name: string): LucideIcon | undefined {
  return ICON_MAP[name];
}

export function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

// Usa domain_url (URL completa, não só o domínio) para que o serviço de
// favicons olhe a página específica — importante para casos como
// docs.google.com, onde /favicon.ico ou o favicon "genérico" do domínio
// não batem com o ícone real exibido na aba (ex: o ícone azul do Docs).
export function getFaviconUrl(url: string, size = 64): string | undefined {
  try {
    new URL(url);
    return `https://www.google.com/s2/favicons?sz=${size}&domain_url=${encodeURIComponent(url)}`;
  } catch {
    return undefined;
  }
}

// Fallback caso o serviço de favicons não retorne nada útil.
export function getFaviconFallbackUrl(url: string): string | undefined {
  try {
    const { origin } = new URL(url);
    return `${origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}
