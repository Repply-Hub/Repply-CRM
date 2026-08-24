import {
  LayoutDashboard, Kanban, Users, FileText, Settings, HardHat, Factory,
  Globe, CalendarDays, ClipboardList, Link, BarChart3, Mail, Phone,
  Star, Heart, BookOpen, Briefcase, Home, Map, Package, ShoppingCart,
  Truck, Wallet, Wrench, Zap, MessageCircle, MessageSquare, List, FileWarning,
  Smartphone, Building2, History, ToggleLeft, type LucideIcon
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
  History,
  ToggleLeft,
};

export const AVAILABLE_ICONS = Object.keys(ICON_MAP);

// Sempre devolve um ícone válido. Um nome salvo que saia do ICON_MAP (ex.:
// ícone removido do catálogo numa limpeza futura) antes deixava o atalho sem
// nenhum ícone renderizado — nem erro, nem fallback, só espaço em branco.
export function getIconComponent(name: string): LucideIcon {
  return ICON_MAP[name] ?? Link;
}

export function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

// Domínio digitado sem protocolo (ex.: "google.com", "www.receita.rn.gov.br",
// "wa.me/5584999999999") não é reconhecido por `isExternalUrl`. Sem essa
// detecção, o item era salvo como rota interna quebrada (`/google.com`), sem
// favicon e sem link funcional — bug documentado em respostas.md §4. Rotas
// internas de verdade não têm ponto no nome, então exigir pelo menos um
// "algo.algo" no início evita falso positivo em caminho interno digitado sem
// barra (ex.: "relatorios").
const DOMAIN_LIKE_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#].*)?$/i;

export function looksLikeDomain(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('/') || isExternalUrl(trimmed)) return false;
  return DOMAIN_LIKE_RE.test(trimmed);
}

// DuckDuckGo como fonte PRINCIPAL, não o Google: testado contra sites reais
// que usuários cadastraram (Vercel, portais de sefaz/receita estadual) e o
// Google (`s2/favicons?domain_url=`) devolveu 404 pra 2 de 3 — inclusive pra
// domain_url apontando pra uma página específica que ELE MESMO diz ter
// indexado. DuckDuckGo acertou 2 de 3 nos mesmos testes. Nenhum serviço
// público de favicon é 100%: sites de baixo tráfego (intranet, portal
// estadual pouco visitado) muitas vezes não estão indexados em NENHUM dos
// dois — daí a cadeia de fallback em `SidebarFavicon` (DuckDuckGo → Google →
// favicon.ico do próprio site → ícone genérico).
export function getFaviconUrl(url: string): string | undefined {
  try {
    const { hostname } = new URL(url);
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
  } catch {
    return undefined;
  }
}

// Usa domain_url (URL completa, não só o domínio) para que o serviço olhe a
// página específica — importante para casos como docs.google.com, onde
// /favicon.ico ou o favicon "genérico" do domínio não batem com o ícone real
// exibido na aba (ex: o ícone azul do Docs). Segunda tentativa, depois do
// DuckDuckGo falhar.
export function getFaviconGoogleUrl(url: string, size = 64): string | undefined {
  try {
    new URL(url);
    return `https://www.google.com/s2/favicons?sz=${size}&domain_url=${encodeURIComponent(url)}`;
  } catch {
    return undefined;
  }
}

// Última tentativa antes do ícone genérico: o favicon.ico do próprio site.
// Só acerta quando o site serve o arquivo exatamente nesse path na raiz — a
// declaração real (`<link rel="icon">`) pode apontar pra outro lugar (ex:
// `/img/favicon.ico`), mas ler o HTML da página pra descobrir isso exigiria
// um fetch cross-origin que a maioria dos sites bloqueia via CORS.
export function getFaviconFallbackUrl(url: string): string | undefined {
  try {
    const { origin } = new URL(url);
    return `${origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}
