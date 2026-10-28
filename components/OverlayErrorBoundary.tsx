import { Component, type ReactNode } from "react";

import { diagnosticLog } from "@/lib/errorDiagnostic";

type Props = {
  /** Which overlay, for the device log. */
  name: string;
  children: ReactNode;
};

type State = { failed: boolean };

/**
 * Around each prompt the root layout draws over every screen — the tour, the
 * update and push prompts, the claim sheet, the call.
 *
 * Those sit beside the navigator, outside every route's `ErrorBoundary`, so an
 * error in one used to close the app. Now that overlay alone is hidden for
 * the rest of the session and the screen under it carries on: a missing
 * prompt costs a nudge, a closed app costs the order. The redacted error goes
 * to `console.error`, which lands in the Android device log.
 *
 * A class because React catches render errors only in one.
 */
export class OverlayErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[overlay:${this.props.name}] hidden after it crashed while drawing: ${diagnosticLog(error)}`);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
