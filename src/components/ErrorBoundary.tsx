import { Component, type ReactNode, type ErrorInfo } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?:
    | ReactNode
    | ((error: Error | null, reset: () => void) => ReactNode);
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] render error:", error, info.componentStack);
    try {
      // log global auth snapshot if available to help debugging
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const auth = (window as any).__APP_AUTH_STATE__;
      if (auth) console.error("[ErrorBoundary] __APP_AUTH_STATE__:", auth);
      // also set an attribute on body so crashes can be detected from page
      if (typeof document !== "undefined" && document.body) {
        document.body.setAttribute("data-last-error-ts", String(Date.now()));
      }
    } catch (e) {
      // ignore
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === "function") {
          return (
            this.props.fallback as (e: Error | null, r: () => void) => ReactNode
          )(this.state.error, this.handleReset);
        }
        return this.props.fallback;
      }

      const isDev = process.env.NODE_ENV !== "production";
      const errorMessage = this.state.error
        ? this.state.error.message
        : "Erro desconhecido";
      const errorStack =
        this.state.error && this.state.error.stack
          ? this.state.error.stack
          : "";
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-sm font-medium text-destructive">
            Algo deu errado ao carregar este conteúdo.
          </p>
          <p className="text-xs text-muted-foreground max-w-lg">
            {errorMessage}
          </p>

          {isDev && (
            <div className="mt-3 w-full max-w-xl text-left bg-muted/5 p-3 rounded-md border border-border/40 overflow-auto max-h-48">
              <pre className="text-[11px] whitespace-pre-wrap break-words">
                {errorStack}
              </pre>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (isDev) {
                  const payload = `Error: ${errorMessage}\n\nStack:\n${errorStack}`;
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(payload).catch(() => {
                      const ta = document.createElement("textarea");
                      ta.value = payload;
                      document.body.appendChild(ta);
                      ta.select();
                      try {
                        document.execCommand("copy");
                      } catch (e) {
                        /* ignore */
                      }
                      document.body.removeChild(ta);
                    });
                  } else {
                    const ta = document.createElement("textarea");
                    ta.value = payload;
                    document.body.appendChild(ta);
                    ta.select();
                    try {
                      document.execCommand("copy");
                    } catch (e) {
                      /* ignore */
                    }
                    document.body.removeChild(ta);
                  }
                }
                this.handleReset();
              }}
            >
              Tentar novamente
            </Button>
            {isDev && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const payload = `Error: ${errorMessage}\n\nStack:\n${errorStack}`;
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard
                      .writeText(payload)
                      .then(() =>
                        console.info(
                          "[ErrorBoundary] erro copiado para clipboard",
                        ),
                      )
                      .catch(() => {
                        const ta = document.createElement("textarea");
                        ta.value = payload;
                        document.body.appendChild(ta);
                        ta.select();
                        try {
                          document.execCommand("copy");
                        } catch (e) {
                          /* ignore */
                        }
                        document.body.removeChild(ta);
                        console.info("[ErrorBoundary] erro copiado (fallback)");
                      });
                  } else {
                    const ta = document.createElement("textarea");
                    ta.value = payload;
                    document.body.appendChild(ta);
                    ta.select();
                    try {
                      document.execCommand("copy");
                    } catch (e) {
                      /* ignore */
                    }
                    document.body.removeChild(ta);
                    console.info("[ErrorBoundary] erro copiado (fallback)");
                  }
                }}
              >
                Copiar erro
              </Button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
