import React from "react";
import PropTypes from "prop-types";

const AUTO_RETRY_MS = 5000;
const RELOAD_COOLDOWN_MS = 60_000;
const RELOAD_STORAGE_KEY = "sweep.lastErrorReloadAt";

/**
 * Error boundary for kiosk resilience.
 *
 * Supports two modes:
 *   - Root boundary (`silent` false, default): renders a minimal dark
 *     recovery banner, auto-retries remounting children after 5 s, and falls
 *     back to a full page reload (capped via sessionStorage at once per 60 s)
 *     if repeated crashes persist.
 *   - Panel/overlay boundary (`silent` true): isolates non-critical overlays
 *     (Settings, Debug, UpdateModal, NowcastPanel) so a throw inside a panel
 *     renders null instead of unmounting the live radar map.
 */
class ErrorBoundary extends React.Component {
  /**
   * @param {object} props component props
   */
  constructor(props) {
    super(props);
    this.state = {
      error: null,
      retryKey: 0,
      crashes: 0,
    };
    this.retryTimer = null;
    this.handleRetry = this.handleRetry.bind(this);
  }

  /**
   * @param {Error} error caught render error
   * @returns {{error: Error}} state patch
   */
  static getDerivedStateFromError(error) {
    return { error };
  }

  /**
   * @param {Error} error caught render error
   * @param {object} info React componentStack metadata
   */
  componentDidCatch(error, info) {
    const label = this.props.label || (this.props.silent ? "panel" : "root");
    console.error(`[ErrorBoundary:${label}]`, error, info);

    clearTimeout(this.retryTimer);
    if (this.props.silent) {
      // Allow a transient panel crash to clear itself after a cooldown so
      // re-opening the panel later can recover without a page reload.
      this.retryTimer = setTimeout(() => {
        this.setState((prev) => ({
          error: null,
          retryKey: prev.retryKey + 1,
        }));
      }, AUTO_RETRY_MS * 2);
      return;
    }

    const nextCrashes = this.state.crashes + 1;
    this.setState({ crashes: nextCrashes });

    if (nextCrashes >= 2 && typeof window !== "undefined") {
      try {
        const last = Number(window.sessionStorage.getItem(RELOAD_STORAGE_KEY) || 0);
        const now = Date.now();
        if (!Number.isFinite(last) || now - last > RELOAD_COOLDOWN_MS) {
          window.sessionStorage.setItem(RELOAD_STORAGE_KEY, String(now));
          window.location.reload();
          return;
        }
      } catch {
        // sessionStorage unavailable — continue with in-process remount retry.
      }
    }

    this.retryTimer = setTimeout(this.handleRetry, AUTO_RETRY_MS);
  }

  /**
   * Reset silent boundary error if caller's `resetKey` changes.
   *
   * @param {object} prevProps previous props
   */
  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      clearTimeout(this.retryTimer);
      this.setState((prev) => ({
        error: null,
        retryKey: prev.retryKey + 1,
      }));
    }
  }

  /**
   * Clear pending auto-retry timer on unmount.
   */
  componentWillUnmount() {
    clearTimeout(this.retryTimer);
  }

  /**
   * Remount children with a fresh key to clear transient state.
   */
  handleRetry() {
    clearTimeout(this.retryTimer);
    this.setState((prev) => ({
      error: null,
      retryKey: prev.retryKey + 1,
    }));
  }

  /**
   * @returns {React.ReactNode} rendered children or fallback
   */
  render() {
    if (this.state.error) {
      if (this.props.silent) return null;
      return (
        <div
          role="alert"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            background: "#0d0f12",
            color: "#e5e7eb",
            fontFamily: "system-ui, -apple-system, sans-serif",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "16px", fontWeight: 600 }}>
            Display interrupted — recovering automatically…
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              background: "rgba(255, 255, 255, 0.08)",
              color: "#e5e7eb",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Retry now
          </button>
        </div>
      );
    }

    return (
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
  silent: PropTypes.bool,
  label: PropTypes.string,
  resetKey: PropTypes.any,
};

export default ErrorBoundary;
