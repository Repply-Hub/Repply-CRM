import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-sm font-medium text-destructive">Algo deu errado ao carregar este conteúdo.</p>
          {this.state.error && (
            <p className="text-xs text-muted-foreground max-w-sm">{this.state.error.message}</p>
          )}
          <Button variant="outline" size="sm" onClick={this.handleReset}>
            Tentar novamente
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
