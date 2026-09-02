import type { CSSProperties, SyntheticEvent } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// 🔴 SEGURA O EVENTO DENTRO DO AVISO. O sonner 1.7.4 não usa portal: ele renderiza aqui
// mesmo, irmão do resto do app. O Radix Dialog/Sheet fecha ao detectar um `pointerdown`
// que borbulha até o `document` vindo de fora do modal — e um clique no "X" do aviso é
// exatamente isso. Sem parar a subida, fechar o aviso fechava junto o painel de detalhe
// que estava aberto atrás. O clique já foi tratado pelo botão antes de chegar aqui (fase
// de bolha), então parar a propagação neste ponto não quebra nada do próprio aviso.
const segurarEvento = (e: SyntheticEvent) => e.stopPropagation();

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <div
      onPointerDown={segurarEvento}
      onMouseDown={segurarEvento}
      onClick={segurarEvento}
      onFocus={segurarEvento}
    >
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-right"
      // 🔴 A `var(--altura-faixa-cobranca, 0px)` e o que impede o aviso de pousar em cima do
      // cabecalho quando a faixa de cobranca aparece. Ela e escrita por
      // <FaixaDeCobranca>, que se mede sozinha (a faixa quebra em duas linhas no celular,
      // entao a altura nao e constante). Sem a faixa, o padrao 0px mantem o de sempre.
      offset={{ top: "calc(5.5rem + 1rem + var(--altura-faixa-cobranca, 0px))", right: "1rem" }}
      style={{ "--width": "26rem" } as CSSProperties}
      className="toaster group"
      closeButton
      toastOptions={{
        classNames: {
          // 🔴 `pointer-events-auto` no toast: quando um painel de detalhe (Sheet) ou um
          // modal está aberto, o Radix põe `pointer-events: none` no <body>, e o aviso do
          // sonner — que fica pendurado no <body>, fora do modal — herda isso e para de
          // responder ao clique. Sem esta classe não dava para fechar o aviso nem clicar
          // em "Abrir conversa" com um Sheet aberto. Reativar no próprio toast basta: o "X"
          // e o botão de ação são filhos dele.
          toast:
            "pointer-events-auto group toast group-[.toaster]:bg-primary group-[.toaster]:text-primary-foreground group-[.toaster]:border-primary group-[.toaster]:shadow-lg group-[.toaster]:!flex-col group-[.toaster]:!items-start group-[.toaster]:!gap-1.5 group-[.toaster]:!py-3 group-[.toaster]:!pr-8",
          content: "group-[.toast]:!w-full",
          description: "group-[.toast]:text-primary-foreground/80",
          actionButton:
            "group-[.toast]:bg-primary-foreground group-[.toast]:text-primary group-[.toast]:!ml-auto group-[.toast]:!mt-0 group-[.toast]:!h-6",
          cancelButton: "group-[.toast]:bg-primary-foreground/20 group-[.toast]:text-primary-foreground",
          closeButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:border-primary-foreground/30 group-[.toast]:!left-auto group-[.toast]:!right-3 group-[.toast]:!top-3 group-[.toast]:!transform-none",
          error:
            "group-[.toaster]:!bg-destructive group-[.toaster]:!text-destructive-foreground group-[.toaster]:!border-destructive [&_[data-description]]:!text-destructive-foreground/90 [&_[data-close-button]]:!bg-destructive [&_[data-close-button]]:!text-destructive-foreground [&_[data-close-button]]:!border-destructive-foreground/30",
        },
      }}
      {...props}
    />
    </div>
  );
};

export { Toaster, toast };
