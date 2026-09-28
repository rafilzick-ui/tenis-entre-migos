import React, { Component } from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message: string };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Application error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-background px-4">
          <div className="max-w-md text-center">
            <h1 className="font-display text-xl font-bold">Algo deu errado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ocorreu um erro ao carregar a pagina. Tente recarregar.
            </p>
            <pre className="mt-4 overflow-auto rounded-lg border bg-muted p-3 text-left text-xs text-muted-foreground">
              {this.state.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white"
            >
              Recarregar pagina
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
