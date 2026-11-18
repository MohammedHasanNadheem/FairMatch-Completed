import { Component, type ErrorInfo, type ReactNode } from "react";

type State = { failed: boolean; reference: string };

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { failed: false, reference: "" };

  static getDerivedStateFromError(): State {
    return {
      failed: true,
      reference: crypto.randomUUID().slice(0, 8).toUpperCase(),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("FairMatch interface failure", {
      name: error.name,
      reference: this.state.reference,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="fatal-error">
        <section>
          <p className="small-label">SAFE RECOVERY</p>
          <h1>This workspace could not finish loading.</h1>
          <p>
            Your last confirmed server-side action remains recorded. Refresh
            once; if the problem continues, share reference{" "}
            <strong>{this.state.reference}</strong> with FairMatch support.
          </p>
          <div>
            <button onClick={() => window.location.reload()}>
              Refresh workspace
            </button>
            <a href="/">Return to sign in</a>
          </div>
        </section>
      </main>
    );
  }
}
