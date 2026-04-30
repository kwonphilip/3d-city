import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="error-boundary">
        <h1>Something broke.</h1>
        <pre>{error.message || String(error)}</pre>
        <div className="error-actions">
          <button type="button" onClick={() => { this.setState({ error: null }) }}>
            Try again
          </button>
          <a href="/">Back to landing</a>
        </div>
      </div>
    )
  }
}
